-- La confidentialité, prouvée par assertion — pas seulement écrite en policy.
--
-- Une policy qu'on relit paraît toujours correcte. Ce fichier lance les
-- requêtes qu'un conducteur pourrait vraiment lancer, et vérifie qu'aucune ne
-- rend le nom complet, le numéro, ni la position exacte du passager.
begin;
create extension if not exists pgtap with schema public;

select plan(22);

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
  public.t_utilisateur('Awa', 'passager', 'Awa Ndiaye Diop', '+221771234567') as passager,
  public.t_utilisateur('Modou', 'conducteur', 'Modou Sarr Fall', '+221781112233') as conducteur,
  public.t_utilisateur('Ibrahima', 'conducteur', 'Ibrahima Ba', '+221769998877') as temoin;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-5555-EE', 'Toyota Corolla', 'blanche' from f;

-- La table de fixtures est lue depuis les deux rôles du test.
grant select on f to authenticated;

select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467,
  'Rue Carnot 12, Plateau', 14.7167, -17.4677, 'Ouakam', 2500);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select * from public.submit_offer((select id from d), 'acceptation', 2500, 4::smallint);
set local role postgres;

-- ================================================ AVANT ACCEPTATION, côté conducteur
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select passager from f)),
  'le conducteur ne voit pas la ligne profil du passager'
);

select is_empty(
  $$ select 1 from public.profiles where telephone = '+221771234567' $$,
  'aucune requête ne rend le numéro du passager'
);

select is_empty(
  $$ select 1 from public.profiles where nom_complet = 'Awa Ndiaye Diop' $$,
  'aucune requête ne rend le nom complet du passager'
);

select is_empty(
  format($$ select 1 from public.ride_requests where id = %L $$, (select id from d)),
  'le conducteur ne lit pas la demande en table — donc pas la position exacte'
);

-- Ce qu'il voit, en revanche : la file, avec le prénom seul.
select isnt_empty(
  format($$ select 1 from public.demandes_ouvertes where id = %L $$, (select id from d)),
  'le conducteur voit bien la demande dans la file'
);

select is(
  (select passager_prenom from public.demandes_ouvertes where id = (select id from d)),
  'Awa',
  'la file ne porte que le prénom'
);

select ok(
  (select zone_depart_lat from public.demandes_ouvertes where id = (select id from d))
    <> 14.6928::double precision,
  'la file ne rend pas la latitude exacte'
);

select ok(
  (select zone_depart_lat from public.demandes_ouvertes where id = (select id from d))
    = public.arrondir_zone(14.6928::double precision),
  'la file rend le centre de la maille, et rien d''autre'
);

select is(
  (select count(*)::int from public.demandes_ouvertes
   where destination_libelle = 'Rue Carnot 12, Plateau'),
  0,
  'le libellé du départ — une adresse — n''est nulle part dans la file'
);

set local role postgres;

-- ================================================== AVANT ACCEPTATION, côté passager
-- La symétrie compte : le passager n'a pas non plus le numéro du conducteur.
select public.t_devenir((select passager from f));
set local role authenticated;

select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select conducteur from f)),
  'le passager ne voit pas la ligne profil du conducteur'
);

select isnt_empty(
  format($$ select 1 from public.profils_publics where id = %L $$, (select conducteur from f)),
  'mais il voit son prénom et sa note, pour choisir'
);

select is_empty(
  format($$ select 1 from public.vehicles where conducteur_id = %L $$, (select conducteur from f)),
  'la plaque n''est pas servie avant acceptation'
);

select isnt_empty(
  format($$ select 1 from public.vehicules_publics where conducteur_id = %L $$,
         (select conducteur from f)),
  'mais le modèle et la couleur le sont'
);

select is_empty(
  $$ select 1 from public.demandes_ouvertes $$,
  'un passager ne voit pas la file des demandes — elle est réservée aux conducteurs'
);

-- ------------------------------------------------------------- acceptation --
create temp table c as select * from public.accept_offer((select id from o));
set local role postgres;

-- ================================================== APRÈS ACCEPTATION, côté conducteur
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select telephone from public.profiles where id = (select passager from f)),
  '+221771234567',
  'après acceptation, le conducteur a le numéro du passager'
);

select is(
  (select nom_complet from public.profiles where id = (select passager from f)),
  'Awa Ndiaye Diop',
  'après acceptation, il a le nom complet'
);

select is(
  (select depart_lat from public.ride_requests where id = (select id from d)),
  14.6928::double precision,
  'après acceptation, il a la position EXACTE du départ'
);

select is(
  (select depart_libelle from public.ride_requests where id = (select id from d)),
  'Rue Carnot 12, Plateau',
  'et l''adresse écrite par le passager'
);

set local role postgres;

-- =================================================== APRÈS ACCEPTATION, côté passager
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select plaque from public.vehicles where conducteur_id = (select conducteur from f)),
  'DK-5555-EE',
  'le passager a la plaque pour monter dans la bonne voiture'
);

set local role postgres;

-- ============================================================ un tiers ne voit rien
select public.t_devenir((select temoin from f));
set local role authenticated;

select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select passager from f)),
  'un conducteur étranger à la course ne voit rien du passager'
);

select is_empty(
  format($$ select 1 from public.ride_requests where id = %L $$, (select id from d)),
  'ni la demande — elle n''est plus dans la file, elle est verrouillée'
);

set local role postgres;

-- ================================================== APRÈS LA COURSE, le numéro repart
update public.rides set statut = 'terminee', terminee_le = now()
where id = (select id from c);

select public.t_devenir((select conducteur from f));
set local role authenticated;

select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select passager from f)),
  'course terminée : le conducteur ne garde pas le numéro du passager'
);

set local role postgres;

select * from finish();
rollback;
