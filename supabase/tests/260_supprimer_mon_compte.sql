-- Supprimer son compte : ce qui part, ce qui reste, et ce qui bloque.
--
-- Exigence App Store 5.1.1(v). Les assertions vérifient les trois moitiés de la
-- règle : plus aucune donnée personnelle lisible, la course de la CONTREPARTIE
-- intacte, et la session morte.
begin;
create extension if not exists pgtap with schema public;

select plan(17);

create function public.t_utilisateur(p_prenom text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, phone)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test',
          '+2217' || substr(replace(v_id::text, '-', ''), 1, 7));
  update public.profiles
     set prenom = p_prenom, nom_complet = p_prenom || ' Diop',
         telephone = '+221770000000', photo_url = v_id || '/profil.jpg'
   where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select public.t_utilisateur('Awa') as passager,
       public.t_utilisateur('Modou') as conducteur;
grant select on f to authenticated;

-- Un conducteur en règle, en ligne.
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-SUP-01', 'Toyota Yaris', 'blanche' from f;

insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

select set_config('request.jwt.claims', '', true);
select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.maj_position(14.7095, -17.4440, true);

-- Des fichiers, comme il y en aurait vraiment.
reset role;
insert into storage.buckets (id, name) values ('photos-profil', 'photos-profil')
on conflict do nothing;
insert into storage.objects (bucket_id, name)
select 'photos-profil', conducteur || '/profil.jpg' from f;

-- Le passager a des lieux favoris.
select public.t_devenir((select passager from f));
set local role authenticated;
select public.enregistrer_lieu_favori(
  'domicile', 14.7091, -17.4478, 'Colobane', 'Immeuble bleu, 3e étage');

-- Une course, jusqu'au bout de la négociation.
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

-- ─────────────────────────────── une course active BLOQUE la suppression ────
select is(
  (select public.suppression_possible()), false,
  'pendant une course active, la question se pose AVANT d''effacer un fichier');

select throws_ok(
  'select public.supprimer_mon_compte()',
  'course_active',
  'on ne s''efface pas pendant qu''un conducteur roule vers soi');

select isnt_empty(
  'select 1 from public.lieux_favoris',
  'et rien n''a été effacé au passage — le refus est complet');

-- On termine la course.
reset role;
update public.rides set statut = 'terminee', terminee_le = now()
 where id = (select id from c);

-- Le conducteur laisse un avis sur le passager : il vise quelqu'un qui s'en va.
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.noter_course((select id from c), 5::smallint, 'Ponctuelle.');

-- ────────────────────────────────────────────── la suppression elle-même ────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
select is(
  (select public.suppression_possible()), true,
  'la course terminée, la question rend vrai');

select lives_ok(
  'select public.supprimer_mon_compte()',
  'la course terminée, la suppression passe');

reset role;

select is_empty(
  $$ select 1 from public.lieux_favoris where proprietaire = (select passager from f) $$,
  'les lieux favoris sont partis — c''est l''annuaire de domiciles qu''on ne veut pas détenir');

select is(
  (select prenom from public.profiles where id = (select passager from f)),
  'Compte supprimé',
  'le prénom est remplacé, pas la ligne — une course appartient à deux personnes');

select is(
  (select nom_complet || coalesce(telephone, '') || coalesce(photo_url, '')
     from public.profiles where id = (select passager from f)),
  null,
  'nom, téléphone et photo sont à null');

select is(
  (select nb_notes from public.profiles where id = (select passager from f)),
  0,
  'la réputation d''un compte qui n''existe plus ne survit pas');

select is_empty(
  $$ select 1 from public.evaluations where cible_id = (select passager from f) $$,
  'les avis REÇUS partent avec le compte');

-- ────────────────────────────── ce qui reste appartient à la contrepartie ────
select isnt_empty(
  $$ select 1 from public.rides where id = (select id from c) $$,
  'la course reste : l''effacer priverait le conducteur de son historique et de ses gains');

select is(
  (select conducteur_id from public.rides where id = (select id from c)),
  (select conducteur from f),
  'et elle pointe toujours vers son conducteur');

-- ───────────────────────────────────── le compte ne se rouvre pas ────
select is(
  (select phone from auth.users where id = (select passager from f)),
  null,
  'le numéro est libéré : un numéro sénégalais se réattribue, le prochain porteur ne doit pas hériter du compte');

select ok(
  (select banned_until from auth.users where id = (select passager from f)) > now() + interval '100 years',
  'le compte est banni sans terme — se reconnecter est impossible');

select is_empty(
  $$ select 1 from auth.sessions where user_id = (select passager from f) $$,
  'la session vivante meurt avec le compte, sans attendre l''application');

-- ────────────────────────────────── et le conducteur n'a rien perdu ────
select is(
  (select prenom from public.profiles where id = (select conducteur from f)),
  'Modou',
  'la contrepartie est intacte');

select isnt_empty(
  $$ select 1 from public.vehicles where conducteur_id = (select conducteur from f) $$,
  'son véhicule aussi');

select * from finish();
rollback;
