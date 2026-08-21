-- Les avis reçus : les siens, sans savoir qui les a écrits.
begin;
create extension if not exists pgtap with schema public;

select plan(5);

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
       public.t_utilisateur('Modou') as conducteur,
       public.t_utilisateur('Khady') as curieux;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-AVI-01', 'Kia Picanto', 'grise' from f;

insert into public.ride_requests (
  passager_id, service, depart_lat, depart_lon, depart_libelle,
  destination_lat, destination_lon, destination_libelle, prix_xof, statut, expires_at)
select passager, 'urbain', 14.7091, -17.4478, 'Colobane',
       14.7074, -17.4744, 'Mermoz', 2000, 'verrouillee', now() + interval '1 hour'
from f;

insert into public.offers (
  demande_id, conducteur_id, vehicule_id, type, prix_xof, delai_arrivee_min,
  statut, expires_at)
select d.id, (select conducteur from f),
       (select id from public.vehicles where conducteur_id = (select conducteur from f)),
       'acceptation', 2000, 6, 'acceptee', now() + interval '1 hour'
from public.ride_requests d;

insert into public.rides (
  demande_id, offre_id, passager_id, conducteur_id, vehicule_id,
  prix_convenu_xof, statut, terminee_le)
select o.demande_id, o.id, (select passager from f), (select conducteur from f),
       o.vehicule_id, o.prix_xof, 'terminee', now()
from public.offers o;

-- Les deux notent : tout se dévoile.
select public.t_devenir((select passager from f));
set local role authenticated;
select public.noter_course((select id from public.rides limit 1), 5::smallint, 'Ponctuel.');
reset role;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.noter_course((select id from public.rides limit 1), 4::smallint, 'Très bien.');

-- ─────────────────────────────────────────── ce que le conducteur voit ────
select is(
  (select count(*)::integer from public.mes_evaluations),
  1,
  'le conducteur voit l''avis qu''il a REÇU'
);

select is(
  (select note from public.mes_evaluations),
  5::smallint,
  'et c''est bien la note du passager, pas la sienne'
);

-- LE point : on ne dit jamais qui a noté.
select hasnt_column('public', 'mes_evaluations', 'auteur_id',
  'aucune colonne auteur_id — savoir qui a noté ouvre la porte aux représailles');

-- ────────────────────────────────── la vue interne reste interne ──────────
select throws_ok(
  $$ select 1 from public.evaluations_visibles $$,
  '42501',
  null,
  'evaluations_visibles n''est plus lisible par un compte connecté'
);

-- ─────────────────────────────────────── et personne ne lit les miens ─────
reset role;
select public.t_devenir((select curieux from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.mes_evaluations),
  0,
  'un tiers ne lit aucun avis — ni le sien qui n''existe pas, ni ceux des autres'
);

select * from finish();
rollback;
