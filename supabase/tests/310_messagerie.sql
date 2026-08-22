-- La messagerie interne : qui écrit, qui lit, et quand ça se ferme.
--
-- Trois règles, et chacune est une porte qu'on croit fermée tant qu'on ne l'a
-- pas poussée :
--
--   1. un TIERS ne lit rien et n'écrit rien — même pas par la fonction, qui est
--      SECURITY DEFINER et traverse la RLS ;
--   2. le fil se FERME à la fin de la course, mais reste LISIBLE ;
--   3. le fil n'existe pas avant l'acceptation.
begin;
create extension if not exists pgtap with schema public;

select plan(11);

create function public.t_utilisateur(p_prenom text) returns uuid language plpgsql as $$
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
select public.t_utilisateur('Awa') as passagere,
       public.t_utilisateur('Modou') as conducteur,
       public.t_utilisateur('Fatou') as tierce;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-4821-A', 'Kia Picanto', 'grise' from f;
update public.profiles set documents_valides_le = now()
 where id = (select conducteur from f);

-- Une course verrouillée, posée à la main : ce test porte sur le FIL, pas sur
-- le chemin qui mène à la course.
with d as (
  insert into public.ride_requests
    (passager_id, service, depart_lat, depart_lon, depart_libelle,
     destination_lat, destination_lon, destination_libelle,
     prix_xof, statut, expires_at)
  select passagere, 'urbain', 14.7091, -17.4478, 'Colobane',
         14.7074, -17.4744, 'Mermoz', 2500, 'verrouillee', now() + interval '1 hour'
  from f returning id
), o as (
  insert into public.offers
    (demande_id, conducteur_id, vehicule_id, type, auteur, tour, prix_xof,
     delai_arrivee_min, statut, expires_at)
  select d.id, (select conducteur from f),
         (select id from public.vehicles where conducteur_id = (select conducteur from f)),
         'contre_offre', 'conducteur', 1, 2500, 5, 'acceptee', now() + interval '1 hour'
  from d returning id, demande_id
)
insert into public.rides (demande_id, offre_id, passager_id, conducteur_id,
                          vehicule_id, prix_convenu_xof, statut)
select o.demande_id, o.id, (select passagere from f), (select conducteur from f),
       (select id from public.vehicles where conducteur_id = (select conducteur from f)),
       2500, 'verrouillee'
from o;

create temp table c as
select id from public.rides where passager_id = (select passagere from f);
grant select on c to authenticated;

-- ─────────────────────────────────── 1. les deux participants écrivent ──
select public.t_devenir((select conducteur from f));
set local role authenticated;

select lives_ok(
  $$ select public.envoyer_message((select id from c), 'Je suis à 3 minutes') $$,
  'Le conducteur écrit dans le fil de sa course'
);

select public.t_devenir((select passagere from f));
select lives_ok(
  $$ select public.envoyer_message((select id from c), 'Ok, je suis devant la pharmacie') $$,
  'La passagère répond'
);

select is(
  (select count(*)::int from public.messages where course_id = (select id from c)),
  2,
  'et elle voit les DEUX messages, pas seulement le sien'
);

-- ──────────────────────────────────────── 2. un message vide est refusé ──
select throws_ok(
  $$ select public.envoyer_message((select id from c), '   ') $$,
  'P0001', 'message_vide',
  'Un message blanc n''entre pas dans le fil'
);

-- ────────────────────────────────────── 3. LA TIERCE NE VOIT RIEN ──
select public.t_devenir((select tierce from f));

select is(
  (select count(*)::int from public.messages where course_id = (select id from c)),
  0,
  'Une tierce personne ne lit RIEN du fil des deux autres'
);

select throws_ok(
  $$ select public.envoyer_message((select id from c), 'Bonjour') $$,
  'P0001', 'pas_votre_course',
  'et elle n''y écrit pas non plus — la fonction traverse la RLS, elle doit vérifier elle-même'
);

-- ──────────────────────────── 4. le fil se ferme à la fin de la course ──
set local role postgres;
update public.rides set statut = 'terminee', terminee_le = now()
 where id = (select id from c);

select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  $$ select public.envoyer_message((select id from c), 'Encore un mot') $$,
  'P0001', 'fil_ferme',
  'La course terminée, PLUS AUCUN envoi'
);

select is(
  (select count(*)::int from public.messages where course_id = (select id from c)),
  2,
  'mais l''historique reste LISIBLE — un signalement se fait après coup'
);

-- ─────────────────────────────── 5. une course annulée ferme aussi ──
set local role postgres;
update public.rides set statut = 'annulee' where id = (select id from c);

select public.t_devenir((select passagere from f));
set local role authenticated;

select throws_ok(
  $$ select public.envoyer_message((select id from c), 'Bonjour ?') $$,
  'P0001', 'fil_ferme',
  'Une course annulée ferme le fil comme une course terminée'
);

-- ──────────────────────── 6. la table n'accepte aucune écriture directe ──
-- Le `grant` ne donne que SELECT : sans ça, un client contournerait la fonction
-- et avec elle la règle de fermeture.
select throws_ok(
  $$ insert into public.messages (course_id, expediteur_id, contenu)
     values ((select id from c), (select passagere from f), 'par la porte de derrière') $$,
  '42501', 'permission denied for table messages',
  'Aucun insert direct : la table n''accorde que SELECT'
);

select throws_ok(
  $$ delete from public.messages where course_id = (select id from c) $$,
  '42501', 'permission denied for table messages',
  'et rien ne s''efface — un message retirable est une preuve qui disparaît'
);

select * from finish();
rollback;
