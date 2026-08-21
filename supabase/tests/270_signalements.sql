-- Signaler : qui peut, sur quoi, et qui lit ensuite.
--
-- Exigence App Store 1.2. Les assertions tiennent les trois bords : on ne
-- signale que SA course, la file ne s'ouvre qu'aux admins, et l'auteur du
-- signalement n'est projeté nulle part — le savoir invite à la représaille.
begin;
create extension if not exists pgtap with schema public;

select plan(10);

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
select public.t_utilisateur('Fatou') as passager,
       public.t_utilisateur('Ibou') as conducteur,
       public.t_utilisateur('Tiers') as temoin,
       public.t_utilisateur('Chef') as admin;
grant select on f to authenticated;

update public.profiles set est_admin = true where id = (select admin from f);

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-SIG-01', 'Hyundai i10', 'noire' from f;

insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

select set_config('request.jwt.claims', '', true);
select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

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

-- ───────────────────────────────────────────────── signaler sa course ────
select public.t_devenir((select passager from f));
set local role authenticated;

select lives_ok(
  $$ select public.signaler((select id from c), 'conduite_dangereuse') $$,
  'on signale la course qu''on vient de faire');

-- ─────────────────────────────── un avis qui n'existe pas ne se signale pas ────
select throws_ok(
  $$ select public.signaler((select id from c), 'insulte', true) $$,
  'P0001',
  'aucun_avis_a_signaler',
  'on ne signale pas un avis qu''on n''a pas reçu');

-- Le conducteur note le passager : l'avis existe désormais.
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.noter_course((select id from c), 2::smallint, 'Bof.');

reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
select lives_ok(
  $$ select public.signaler((select id from c), 'insulte', true) $$,
  'et on le signale dès qu''il existe — sans jamais apprendre qui l''a écrit');

-- ──────────────────────────────── la course d'un autre reste inaccessible ────
reset role;
select public.t_devenir((select temoin from f));
set local role authenticated;
select throws_ok(
  $$ select public.signaler((select id from c), 'fraude') $$,
  'P0001',
  'course_pas_la_votre',
  'un tiers ne signale pas une course où il n''est pas — sinon la fonction sert à savoir qu''un identifiant existe');

-- ───────────────────────────────────────── la table ne se lit pas en direct ────
select throws_ok(
  'select 1 from public.signalements',
  '42501',
  null,
  'personne ne lit la table directement — aucune policy, aucun droit');

select throws_ok(
  $$ insert into public.signalements (auteur, cible, motif, course_id)
     values ((select temoin from f), (select passager from f), 'autre', (select id from c)) $$,
  '42501',
  null,
  'et personne n''y écrit non plus : on passe par la fonction, ou par rien');

-- ─────────────────────────────────────────────────────── la file d'attente ────
select is_empty(
  'select 1 from public.signalements_recus',
  'un utilisateur ordinaire ne voit AUCUN signalement — le filtre est dans la vue');

reset role;
select public.t_devenir((select admin from f));
set local role authenticated;

select is(
  (select count(*)::int from public.signalements_recus),
  2,
  'l''admin voit les deux signalements');

select is(
  (select total_sur_la_cible from public.signalements_recus limit 1),
  2::bigint,
  'et le compte par cible, qui est ce qui fait décider');

reset role;
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'signalements_recus'
       and column_name = 'auteur' $$,
  'la vue ne projette PAS l''auteur : traiter un signalement ne demande pas de savoir qui a parlé');

select * from finish();
rollback;
