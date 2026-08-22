-- Passer en ligne exige un dossier validé — et le SERVEUR le dit, pas l'écran.
--
-- L'écran ne montre pas le bouton GO à qui n'a pas la capacité. Ce test existe
-- parce qu'un écran qui cache n'est pas un serveur qui refuse : un client
-- publié, un client périmé, ou la clé anonyme entre les mains de n'importe qui
-- n'ont aucune raison d'obéir à un bouton grisé.
--
-- Les trois portes qui restent OUVERTES comptent autant que celle qu'on ferme :
-- sortir de la ligne, finir une course commencée, et revenir dès que le dossier
-- est complet.
begin;
create extension if not exists pgtap with schema public;

select plan(8);

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
select public.t_utilisateur('Modou') as candidat,
       public.t_utilisateur('Awa') as passagere;
grant select on f to authenticated;

-- ─────────────────────────────── 1. dossier vide : la porte est fermée ──
select public.t_devenir((select candidat from f));
set local role authenticated;

select throws_ok(
  $$ select public.maj_position(14.7091, -17.4478, true) $$,
  'P0001', 'dossier_incomplet',
  'Sans dossier validé, le SERVEUR refuse de passer en ligne'
);

-- ───────────────────────── 2. sortir reste toujours possible ──
-- Sans quoi un conducteur qui perd sa capacité pendant qu'il attend resterait
-- en ligne pour l'éternité, sans aucun moyen d'en sortir.
select lives_ok(
  $$ select public.maj_position(14.7091, -17.4478, false) $$,
  'Se déclarer HORS ligne n''est jamais refusé'
);

select is(
  (select en_ligne from public.positions_conducteurs
    where conducteur_id = (select candidat from f)),
  false,
  'et la position est bien écrite, hors ligne'
);

-- ───────────────────────────────── 3. dossier complet : la porte s'ouvre ──
set local role postgres;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select candidat, 'DK-3000-AA', 'Honda Fit', 'noire' from f;
update public.profiles set documents_valides_le = now()
 where id = (select candidat from f);

select public.t_devenir((select candidat from f));
set local role authenticated;

select lives_ok(
  $$ select public.maj_position(14.7091, -17.4478, true) $$,
  'Dossier validé et véhicule actif : il passe en ligne'
);

select is(
  (select en_ligne from public.positions_conducteurs
    where conducteur_id = (select candidat from f)),
  true,
  'et il y est'
);

-- ──────────────── 4. la capacité tombe pendant qu'il ATTEND : il sort ──
set local role postgres;
update public.profiles set documents_valides_le = null
 where id = (select candidat from f);

select public.t_devenir((select candidat from f));
set local role authenticated;

select throws_ok(
  $$ select public.maj_position(14.7091, -17.4478, true) $$,
  'P0001', 'dossier_incomplet',
  'Capacité perdue : il ne peut plus se remettre en ligne'
);

-- ───────── 5. mais une COURSE EN COURS ne se coupe pas sous le passager ──
-- Un document refusé au milieu du trajet ne doit pas effacer la voiture de
-- l'écran de quelqu'un qui est ASSIS dedans.
set local role postgres;
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
  select d.id, (select candidat from f),
         (select id from public.vehicles where conducteur_id = (select candidat from f) limit 1),
         'contre_offre', 'conducteur', 1, 2500, 5,
         'acceptee', now() + interval '1 hour'
  from d returning id, demande_id
)
insert into public.rides (demande_id, offre_id, passager_id, conducteur_id,
                          vehicule_id, prix_convenu_xof, statut)
select o.demande_id, o.id, (select passagere from f), (select candidat from f),
       (select id from public.vehicles where conducteur_id = (select candidat from f) limit 1),
       2500, 'en_route'
from o;

select public.t_devenir((select candidat from f));
set local role authenticated;

select lives_ok(
  $$ select public.maj_position(14.7100, -17.4500, true) $$,
  'Une course en cours passe : le passager garde sa voiture à l''écran'
);

-- ────────────────────── 6. la course finie, la porte se referme ──
set local role postgres;
update public.rides set statut = 'terminee', terminee_le = now()
 where conducteur_id = (select candidat from f);

select public.t_devenir((select candidat from f));
set local role authenticated;

select throws_ok(
  $$ select public.maj_position(14.7091, -17.4478, true) $$,
  'P0001', 'dossier_incomplet',
  'La course terminée, il ne peut plus se remettre en ligne'
);

select * from finish();
rollback;
