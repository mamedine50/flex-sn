-- create_ride_request() — expiration posée, bornes de prix tenues.
begin;
create extension if not exists pgtap with schema public;

select plan(12);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

-- ------------------------------------------------------------- fixtures --
create function public.t_utilisateur(
  p_prenom text,
  p_role public.role_utilisateur default 'passager',
  p_nom text default null,
  p_tel text default null
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
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
end;
$$;

create temp table f as select public.t_utilisateur('Awa') as passager;

-- --------------------------------------------------- sans authentification --
select throws_ok(
  $$ select public.create_ride_request('urbain', 14.69, -17.44, 'Plateau',
                                       14.75, -17.38, 'Ouakam', 2500) $$,
  'P0001', 'non_authentifie',
  'sans session, aucune demande'
);

-- ------------------------------------------------------- devient le passager --
select set_config('request.jwt.claims',
  json_build_object('sub', (select passager from f), 'role', 'authenticated')::text, true);
set local role authenticated;

-- Bornes urbaines : 500 à 15 000 FCFA.
select throws_ok(
  $$ select public.create_ride_request('urbain', 14.69, -17.44, 'Plateau',
                                       14.75, -17.38, 'Ouakam', 300) $$,
  'P0001', 'prix_hors_bornes',
  'un prix sous la borne basse est refusé'
);

select throws_ok(
  $$ select public.create_ride_request('urbain', 14.69, -17.44, 'Plateau',
                                       14.75, -17.38, 'Ouakam', 20000) $$,
  'P0001', 'prix_hors_bornes',
  'un prix au-dessus de la borne haute est refusé'
);

select throws_ok(
  $$ select public.create_ride_request('urbain', 14.69, -17.44, 'Plateau',
                                       14.75, -17.38, 'Ouakam', 2550) $$,
  'P0001', 'prix_non_multiple_de_100',
  'un prix qui n''est pas un multiple de 100 est refusé'
);

-- Les bornes dépendent du service : 1 000 F passe en urbain, pas en interurbain.
select throws_ok(
  $$ select public.create_ride_request('interurbain', 14.69, -17.44, 'Plateau',
                                       14.79, -16.93, 'Thiès', 1000) $$,
  'P0001', 'prix_hors_bornes',
  '1 000 F est sous la borne interurbaine'
);

-- ------------------------------------------------------------- cas nominal --
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467, 'Plateau',
                                         14.7167, -17.4677, 'Ouakam', 2500);

select is((select statut from d)::text, 'ouverte', 'la demande naît ouverte');
select is((select prix_xof from d), 2500, 'le prix est celui demandé');
select ok((select expires_at from d) > now(), 'l''expiration est dans le futur');
select ok(
  (select expires_at from d) <= now() + public.duree_demande('urbain'),
  'l''expiration ne dépasse pas la durée d''une demande urbaine'
);
select ok(
  (select expires_at from d) > now() + public.duree_demande('urbain') - interval '10 seconds',
  'l''expiration est bien posée à la durée urbaine, pas à une autre'
);

-- Une seule demande ouverte à la fois.
select throws_ok(
  $$ select public.create_ride_request('urbain', 14.69, -17.44, 'Plateau',
                                       14.75, -17.38, 'Ouakam', 3000) $$,
  'P0001', 'demande_deja_ouverte',
  'un passager ne peut pas ouvrir deux demandes'
);

-- La position exacte est bien stockée : c'est la vue qui arrondit, pas la table.
select ok(
  (select depart_lat from d) = 14.6928::double precision,
  'la table garde la position exacte — l''arrondi est un choix de lecture'
);

select * from finish();
rollback;
