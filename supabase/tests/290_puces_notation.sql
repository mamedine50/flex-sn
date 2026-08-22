-- Les puces de la notation : facultatives, validées, et propres à la cible.
begin;
create extension if not exists pgtap with schema public;

select plan(9);

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
select public.t_utilisateur('Aida') as passager,
       public.t_utilisateur('Cheikh') as conducteur;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-PUC-01', 'Picanto', 'grise' from f;

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

reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select (public.submit_offer((select id from d), 'acceptation', 2000, 5::smallint)).id as id;
grant select on o to authenticated;

reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
create temp table c as select (public.accept_offer((select id from o))).id as id;
grant select on c to authenticated;

reset role;
update public.rides set statut = 'terminee', terminee_le = now()
 where id = (select id from c);

-- ─────────────────────── le passager note le conducteur, avec ses puces ────
select public.t_devenir((select passager from f));
set local role authenticated;

select lives_ok(
  $$ select public.noter_course((select id from c), 5::smallint, null,
       array['conduite_sure','ponctuel']) $$,
  'le passager coche des puces qui parlent d''un conducteur');

select is(
  (select puces from public.evaluations
    where course_id = (select id from c) and auteur_id = (select passager from f)),
  array['conduite_sure','ponctuel'],
  'elles sont enregistrées, triées — deux notes identiques doivent se comparer sans dépendre de l''ordre de cochage');

-- ─────────────────────── une puce qui ne va pas à la cible est refusée ────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  $$ select public.noter_course((select id from c), 4::smallint, null,
       array['voiture_propre']) $$,
  'P0001', 'puce_inconnue',
  'on ne dit pas d''un PASSAGER que sa voiture est propre');

select throws_ok(
  $$ select public.noter_course((select id from c), 4::smallint, null,
       array['tres_gentil_vraiment']) $$,
  'P0001', 'puce_inconnue',
  'ni une puce inventée par le client — l''écran afficherait une clé nue');

-- ─────────────────────────────── le conducteur note, avec les bonnes ────
select lives_ok(
  $$ select public.noter_course((select id from c), 4::smallint, null,
       array['ponctuelle','bonne_communication']) $$,
  'les puces du passager, elles, passent');

-- ─────────────────────────────────────── elles sont FACULTATIVES ────
reset role;
update public.rides set statut = 'verrouillee', terminee_le = null where id = (select id from c);
delete from public.evaluations where course_id = (select id from c);
update public.rides set statut = 'terminee', terminee_le = now() where id = (select id from c);

select public.t_devenir((select passager from f));
set local role authenticated;
select lives_ok(
  $$ select public.noter_course((select id from c), 3::smallint) $$,
  'une note sans puce passe — un appel à trois arguments retombe sur la valeur par défaut');

select is(
  (select puces from public.evaluations
    where course_id = (select id from c) and auteur_id = (select passager from f)),
  '{}'::text[],
  'et rend un tableau vide, pas null : une note sans puce n''est pas une note incomplète');

-- ─────────────────────────────── le vocabulaire est lisible, et c'est tout ────
select is(
  (select count(*)::int from public.puces_evaluation),
  7,
  'sept puces au vocabulaire, quatre pour un conducteur et trois pour un passager');

select throws_ok(
  $$ insert into public.puces_evaluation (cle, pour) values ('triche', 'passager') $$,
  '42501',
  null,
  'et personne ne l''enrichit depuis le client');

select * from finish();
rollback;
