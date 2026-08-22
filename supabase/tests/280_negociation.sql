-- La négociation à double sens, et sa fin.
--
-- Quatre messages au maximum : conducteur, passager, conducteur, passager.
-- Le cinquième est refusé. C'est la seule chose qui empêche un marchandage sans
-- fin pendant que la demande expire.
begin;
create extension if not exists pgtap with schema public;

select plan(16);

create function public.t_utilisateur(p_prenom text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles set prenom = p_prenom where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select public.t_utilisateur('Ndeye') as passager,
       public.t_utilisateur('Alioune') as conducteur;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-NEG-01', 'Picanto', 'grise' from f;

insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie','photo_vehicule']::public.type_document[]) t;

select set_config('request.jwt.claims', '', true);
select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite','permis','carte_grise','selfie','photo_vehicule']::public.type_document[]) t;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.maj_position(14.7095, -17.4440, true);

reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select (public.create_ride_request(
  'urbain', 14.7091, -17.4478, 'Colobane',
  14.7074, -17.4744, 'Mermoz', 2000)).id as id;
grant select on d to authenticated;

-- ─────────────────────────────────── tour 1 : le conducteur contre-propose ────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select (public.submit_offer((select id from d), 'contre_offre', 2500, 5::smallint)).id as id;
grant select on o to authenticated;

select is(
  (select tour from public.offers where id = (select id from o)), 1::smallint,
  'la première réponse du conducteur ouvre le fil au tour 1');

select is(
  (select auteur from public.offers where id = (select id from o)), 'conducteur'::public.auteur_offre,
  'et elle est signée du conducteur — sans qu''il ait eu à le dire');

-- ── le conducteur ne peut pas se répondre à lui-même ────
select throws_ok(
  $$ select public.contre_proposer((select id from o), 2400) $$,
  'P0001', 'pas_votre_tour',
  'le conducteur ne surenchérit pas sur sa propre offre — sinon il épuise les tours seul');

-- ─────────────────────────────────────── tour 2 : le passager répond ────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

create temp table o2 as
select (public.contre_proposer((select id from o), 2200)).id as id;
grant select on o2 to authenticated;

select is(
  (select tour from public.offers where id = (select id from o2)), 2::smallint,
  'le passager répond au tour 2 — premier aller-retour');

select is(
  (select statut from public.offers where id = (select id from o)), 'caduque'::public.statut_offre,
  'et l''offre précédente devient caduque : une seule offre vivante par fil');

select is(
  (select auteur from public.offers where id = (select id from o2)), 'passager'::public.auteur_offre,
  'elle est signée du passager');

-- ── le conducteur voit la réponse ────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select count(*)::int from public.negociations_conducteur), 1,
  'le conducteur VOIT la contre-proposition — sans cette vue, elle tombe dans le vide');

select is_empty(
  $$ select 1 from public.negociations_conducteur where destination_libelle is null $$,
  'il voit la destination');

select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'negociations_conducteur'
       and column_name in ('depart_libelle', 'depart_lat', 'depart_lon') $$,
  'mais PAS le point de départ exact — la course n''est pas acceptée');

-- ─────────────────────────────────────── tour 3 : le conducteur répond ────
create temp table o3 as
select (public.contre_proposer((select id from o2), 2400, 6::smallint)).id as id;
grant select on o3 to authenticated;

select is(
  (select tour from public.offers where id = (select id from o3)), 3::smallint,
  'le conducteur reprend la main au tour 3');

-- ─────────────────────────────────────── tour 4 : le passager répond ────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

create temp table o4 as
select (public.contre_proposer((select id from o3), 2300)).id as id;
grant select on o4 to authenticated;

select is(
  (select tour from public.offers where id = (select id from o4)), 4::smallint,
  'le passager répond au tour 4 — second aller-retour');

-- ───────────────────────────── LE CINQUIÈME MESSAGE EST REFUSÉ ────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  $$ select public.contre_proposer((select id from o4), 2350) $$,
  'P0001', 'negociation_epuisee',
  'DEUX ALLERS-RETOURS, ET C''EST TOUT : le cinquième message est refusé');

-- ── mais accepter reste possible, et c'est le conducteur qui accepte ────
create temp table c as select (public.accept_offer((select id from o4))).id as id;
grant select on c to authenticated;

select is(
  (select prix_convenu_xof from public.rides where id = (select id from c)), 2300,
  'le conducteur accepte la contre-proposition du passager, au prix du passager');

select is(
  (select passager_id from public.rides where id = (select id from c)),
  (select passager from f),
  'et la course appartient bien au passager, pas à celui qui a appuyé');

-- ── un tiers ne s'invite pas dans un fil ────
reset role;
create temp table tiers as select public.t_utilisateur('Curieux') as id;
grant select on tiers to authenticated;
select public.t_devenir((select id from tiers));
set local role authenticated;

select throws_ok(
  $$ select public.contre_proposer((select id from o4), 2000) $$,
  'P0001', 'negociation_etrangere',
  'un tiers ne contre-propose pas dans un fil qui n''est pas le sien');

select is_empty(
  'select 1 from public.negociations_conducteur',
  'et il ne voit aucune négociation');

select * from finish();
rollback;
