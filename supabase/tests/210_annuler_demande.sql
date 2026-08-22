-- Retirer sa demande : par son auteur, et seulement tant qu'elle est ouverte.
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
select public.t_utilisateur('Bineta') as passager,
       public.t_utilisateur('Malick') as conducteur,
       public.t_utilisateur('Khady') as intrus;
grant select on f to authenticated;

-- Un conducteur en règle : documents validés et véhicule actif.
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-ANN-01', 'Suzuki Alto', 'rouge' from f;

insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite', 'permis', 'carte_grise', 'selfie', 'photo_vehicule']::public.type_document[]) t;

select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite', 'permis', 'carte_grise', 'selfie', 'photo_vehicule']::public.type_document[]) t;

-- Le conducteur est en ligne, à 400 m du départ.
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.maj_position(14.7095, -17.4440, true);

-- Le passager pose sa demande.
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

create temp table d as
select (public.create_ride_request(
  'urbain', 14.7091, -17.4478, 'Colobane',
  14.7074, -17.4744, 'Mermoz', 2000)).id as id;
grant select on d to authenticated;

-- Le conducteur la voit, et propose.
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.demandes_proches(3000)
   where id = (select id from d)),
  1,
  'la demande ouverte est dans la file du conducteur'
);

create temp table o as
select (public.submit_offer((select id from d), 'contre_offre', 2500, 6::smallint)).id as id;
grant select on o to authenticated;

-- ─────────────────────────────────────────── l'intrus n'annule pas ────────
reset role;
select public.t_devenir((select intrus from f));
set local role authenticated;

select throws_ok(
  format($$ select public.annuler_demande(%L) $$, (select id from d)),
  'P0001', 'demande_etrangere',
  'on n''annule pas la demande de quelqu''un d''autre'
);

reset role;
select is(
  (select statut from public.ride_requests where id = (select id from d)),
  'ouverte'::public.statut_demande,
  'et la demande reste ouverte après cette tentative'
);

-- ──────────────────────────────────────────── l'auteur, lui, annule ───────
select public.t_devenir((select passager from f));
set local role authenticated;

select lives_ok(
  format($$ select public.annuler_demande(%L) $$, (select id from d)),
  'l''auteur retire sa demande'
);

reset role;
select is(
  (select statut from public.ride_requests where id = (select id from d)),
  'annulee'::public.statut_demande,
  'la demande passe à « annulee » — l''état existait, il devient atteignable'
);

select is(
  (select statut from public.offers where id = (select id from o)),
  'caduque'::public.statut_offre,
  'l''offre en attente devient caduque : le conducteur n''attend pas une réponse qui ne viendra pas'
);

-- La file du conducteur est purgée : la vue ne sert que les demandes ouvertes.
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.demandes_proches(3000)
   where id = (select id from d)),
  0,
  'et elle disparaît de la file du conducteur'
);

-- ───────────────────────────────────────── on n'annule pas deux fois ──────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

select throws_ok(
  format($$ select public.annuler_demande(%L) $$, (select id from d)),
  'P0001', 'demande_indisponible',
  'une demande déjà annulée ne se réannule pas'
);

-- ──────────────────────────────── verrouillée : c'est une course ──────────
create temp table d2 as
select (public.create_ride_request(
  'urbain', 14.7091, -17.4478, 'Colobane',
  14.7074, -17.4744, 'Mermoz', 2000)).id as id;
grant select on d2 to authenticated;

reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o2 as
select (public.submit_offer((select id from d2), 'acceptation', 2000, 5::smallint)).id as id;
grant select on o2 to authenticated;

reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
select public.accept_offer((select id from o2));

select throws_ok(
  format($$ select public.annuler_demande(%L) $$, (select id from d2)),
  'P0001', 'demande_verrouillee',
  'une demande verrouillée ne s''annule plus ici : un conducteur roule déjà'
);

select * from finish();
rollback;
