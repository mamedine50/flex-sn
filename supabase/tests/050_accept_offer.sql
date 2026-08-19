-- accept_offer() — ce que produit une acceptation, hors concurrence.
-- La preuve du verrouillage concurrent est dans 060.
begin;
create extension if not exists pgtap with schema public;

select plan(14);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.arrondir_zone(double precision) to authenticated;
grant execute on function public.taille_cellule_deg() to authenticated;
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

create function public.t_utilisateur(
  p_prenom text, p_role public.role_utilisateur default 'passager',
  p_nom text default null, p_tel text default null
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  -- Le déclencheur `creer_profil_apres_inscription` a DÉJÀ posé la ligne : on la
  -- complète, on ne la recrée pas.
  update public.profiles
  set role = p_role,
      prenom = p_prenom,
      nom_complet = p_nom,
      telephone = p_tel,
      -- Conduire est une capacité : sans documents validés, pas d'offre.
      documents_valides_le = case when p_role = 'conducteur' then now() end
  where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select
  public.t_utilisateur('Awa') as passager,
  public.t_utilisateur('Fatou') as autre_passager,
  public.t_utilisateur('Modou', 'conducteur') as conducteur_a,
  public.t_utilisateur('Ibrahima', 'conducteur') as conducteur_b;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur_a, 'DK-1111-AA', 'Toyota Corolla', 'blanche' from f;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur_b, 'DK-2222-BB', 'Hyundai Accent', 'grise' from f;

-- Awa demande, les deux conducteurs répondent.
select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467, 'Plateau',
                                         14.7167, -17.4677, 'Ouakam', 2500);
set local role postgres;

select public.t_devenir((select conducteur_a from f));
set local role authenticated;
create temp table oa as
select * from public.submit_offer((select id from d), 'acceptation', 2500, 4::smallint);
set local role postgres;

select public.t_devenir((select conducteur_b from f));
set local role authenticated;
create temp table ob as
select * from public.submit_offer((select id from d), 'contre_offre', 3000, 2::smallint);
set local role postgres;

-- ------------------------------------------------- l'offre d'un autre --
select public.t_devenir((select autre_passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.accept_offer(%L) $$, (select id from oa)),
  'P0001', 'demande_etrangere',
  'on n''accepte pas une offre faite à quelqu''un d''autre'
);
set local role postgres;

-- ------------------------------------------------------------ cas nominal --
select public.t_devenir((select passager from f));
set local role authenticated;
create temp table c as
select * from public.accept_offer((select id from ob));
set local role postgres;

select is((select prix_convenu_xof from c), 3000,
  'le prix convenu est celui de l''offre acceptée, pas celui demandé');
select is((select statut from c)::text, 'verrouillee', 'la course naît verrouillée');
select is((select conducteur_id from c), (select conducteur_b from f),
  'la course va au conducteur qui a fait l''offre');
select is((select vehicule_id from c), (select vehicule_id from ob),
  'la course porte le véhicule de l''offre');

select is(
  (select statut::text from public.ride_requests where id = (select id from d)),
  'verrouillee',
  'la demande est verrouillée'
);
select ok(
  (select verrouillee_le is not null from public.ride_requests where id = (select id from d)),
  'l''heure du verrouillage est posée'
);

select is(
  (select statut::text from public.offers where id = (select id from ob)),
  'acceptee',
  'l''offre acceptée porte son statut'
);
select is(
  (select statut::text from public.offers where id = (select id from oa)),
  'caduque',
  'les autres offres deviennent caduques'
);

-- ------------------------------------------- après verrouillage, plus rien --
select public.t_devenir((select passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.accept_offer(%L) $$, (select id from oa)),
  'P0001', 'offre_indisponible',
  'une offre devenue caduque ne s''accepte plus'
);
select throws_ok(
  format($$ select public.accept_offer(%L) $$, (select id from ob)),
  'P0001', 'offre_indisponible',
  'une offre déjà acceptée ne s''accepte pas deux fois'
);
set local role postgres;

-- Le conducteur pris n'est plus disponible pour une autre demande.
select public.t_devenir((select autre_passager from f));
set local role authenticated;
create temp table d2 as
select * from public.create_ride_request('urbain', 14.70, -17.44, 'Fann',
                                         14.75, -17.38, 'Yoff', 2000);
set local role postgres;

select public.t_devenir((select conducteur_b from f));
set local role authenticated;
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2000, 5::smallint) $$,
         (select id from d2)),
  'P0001', 'conducteur_indisponible',
  'un conducteur en course ne propose pas une deuxième course'
);
set local role postgres;

-- L'index de dernier recours refuserait de toute façon une deuxième course.
select throws_ok(
  format($$ insert into public.rides
              (demande_id, offre_id, passager_id, conducteur_id, vehicule_id, prix_convenu_xof)
            values (%L, %L, %L, %L, %L, 2000) $$,
         (select id from d2), (select id from oa),
         (select autre_passager from f), (select conducteur_b from f),
         (select vehicule_id from ob)),
  23505,
  null,
  'même en écriture directe, un conducteur ne peut pas avoir deux courses actives'
);

-- Un test d'expiration d'offre, sans toucher à l'horloge du serveur.
select public.t_devenir((select conducteur_a from f));
set local role authenticated;
create temp table oc as
select * from public.submit_offer((select id from d2), 'acceptation', 2000, 3::smallint);
set local role postgres;
update public.offers set expires_at = now() - interval '1 second' where id = (select id from oc);

select public.t_devenir((select autre_passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.accept_offer(%L) $$, (select id from oc)),
  'P0001', 'offre_expiree',
  'une offre expirée ne s''accepte pas'
);
set local role postgres;

select * from finish();
rollback;
