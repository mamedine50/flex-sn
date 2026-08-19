-- expire_stale() — les demandes et les offres échues changent d'état.
begin;
create extension if not exists pgtap with schema public;

select plan(10);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.arrondir_zone(double precision) to authenticated;
grant execute on function public.taille_cellule_deg() to authenticated;
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

create function public.t_utilisateur(
  p_prenom text, p_role public.role_utilisateur default 'passager'
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles
  set role = p_role,
      prenom = p_prenom,
      documents_valides_le = case when p_role = 'conducteur' then now() end
  where id = v_id;
  return v_id;
end; $$;

create temp table f as
select
  public.t_utilisateur('Awa') as p1,
  public.t_utilisateur('Fatou') as p2,
  public.t_utilisateur('Ndeye') as p3,
  public.t_utilisateur('Modou', 'conducteur') as c1,
  public.t_utilisateur('Ibrahima', 'conducteur') as c2;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select c1, 'DK-3333-CC', 'Toyota Corolla', 'blanche' from f;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select c2, 'DK-4444-DD', 'Hyundai Accent', 'grise' from f;

-- Trois demandes : une échue, une encore vivante, une déjà verrouillée.
create temp table d as
with pose as (
insert into public.ride_requests
  (passager_id, service, depart_lat, depart_lon, depart_libelle,
   destination_lat, destination_lon, destination_libelle, prix_xof, expires_at, statut)
select p1, 'urbain'::public.service_course, 14.69, -17.44, 'Plateau', 14.71, -17.46, 'Ouakam', 2500,
       now() - interval '1 minute', 'ouverte'::public.statut_demande from f
union all
select p2, 'urbain'::public.service_course, 14.70, -17.44, 'Fann', 14.75, -17.38, 'Yoff', 3000,
       now() + interval '5 minutes', 'ouverte'::public.statut_demande from f
union all
select p3, 'urbain'::public.service_course, 14.72, -17.47, 'Mermoz', 14.76, -17.39, 'Ngor', 2000,
       now() - interval '1 minute', 'verrouillee'::public.statut_demande from f
returning *
)
select * from pose;

-- Deux offres : une échue, une vivante — toutes deux sur la demande vivante.
create temp table o as
with pose as (
insert into public.offers
  (demande_id, conducteur_id, vehicule_id, type, prix_xof, delai_arrivee_min, expires_at)
select (select id from d where passager_id = (select p2 from f)),
       (select c1 from f),
       (select id from public.vehicles where conducteur_id = (select c1 from f)),
       'acceptation'::public.type_offre, 3000, 4::smallint, now() - interval '30 seconds'
union all
select (select id from d where passager_id = (select p2 from f)),
       (select c2 from f),
       (select id from public.vehicles where conducteur_id = (select c2 from f)),
       'contre_offre'::public.type_offre, 3500, 6::smallint, now() + interval '2 minutes'
returning *
)
select * from pose;

-- ------------------------------------------------------------- le passage --
create temp table r as select * from public.expire_stale();

select is((select demandes_expirees from r), 1, 'une seule demande échue est passée');
select is((select offres_expirees from r), 1, 'une seule offre échue est passée');

select is(
  (select statut::text from public.ride_requests
   where passager_id = (select p1 from f)),
  'expiree',
  'la demande échue est expirée'
);
select is(
  (select statut::text from public.ride_requests
   where passager_id = (select p2 from f)),
  'ouverte',
  'la demande encore vivante n''est pas touchée'
);
select is(
  (select statut::text from public.ride_requests
   where passager_id = (select p3 from f)),
  'verrouillee',
  'une demande verrouillée reste verrouillée, même échue — la course existe'
);

select is(
  (select statut::text from public.offers where prix_xof = 3000),
  'expiree',
  'l''offre échue est expirée'
);
select is(
  (select statut::text from public.offers where prix_xof = 3500),
  'en_attente',
  'l''offre encore vivante n''est pas touchée'
);

-- Idempotence : repasser ne change plus rien. Une tâche planifiée tourne en
-- boucle, elle ne doit pas recompter les mêmes lignes.
create temp table r2 as select * from public.expire_stale();
select is((select demandes_expirees from r2), 0, 'un deuxième passage n''expire plus rien');
select is((select offres_expirees from r2), 0, 'idem pour les offres');

-- Une offre dont la demande est morte tombe aussi, même si elle-même tient
-- encore : sans ça, le passager voit arriver des offres sur une demande éteinte.
update public.ride_requests set statut = 'expiree'
where passager_id = (select p2 from f);
select is(
  (select offres_expirees from public.expire_stale()),
  1,
  'une offre vivante sur une demande morte est expirée aussi'
);

select * from finish();
rollback;
