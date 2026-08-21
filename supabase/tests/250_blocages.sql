-- Le blocage : il tient dans l'appariement, pas seulement à l'écran.
begin;
create extension if not exists pgtap with schema public;

select plan(12);

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
select public.t_utilisateur('Sokhna') as passager,
       public.t_utilisateur('Malick') as conducteur;
grant select on f to authenticated;

-- Un conducteur en règle, en ligne, à portée.
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-BLO-01', 'Kia Picanto', 'grise' from f;

insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

select set_config('request.jwt.claims', '', true);
select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

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

-- ───────────────────────────────────────── avant blocage, tout se voit ────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.demandes_proches(3000) where id = (select id from d)),
  1,
  'sans blocage, le conducteur voit la demande'
);

-- ────────────────────────────────────────────── le passager bloque ────────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

select throws_ok(
  format($$ select public.bloquer(%L) $$, (select passager from f)),
  'P0001', 'blocage_de_soi',
  'on ne se bloque pas soi-même'
);

select lives_ok(
  format($$ select public.bloquer(%L, 'Conduite dangereuse') $$, (select conducteur from f)),
  'le passager bloque le conducteur'
);

select is(
  (select count(*)::integer from public.mes_blocages),
  1,
  'et le retrouve dans sa liste'
);

-- ───────────────────────────── la file du conducteur se vide aussitôt ─────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.demandes_proches(3000) where id = (select id from d)),
  0,
  'LA règle : la demande disparaît de la file du conducteur bloqué'
);

-- Et il n'apprend pas qu'il a été bloqué.
select is(
  (select count(*)::integer from public.mes_blocages),
  0,
  'le bloqué ne voit RIEN — savoir qu''on est bloqué ne sert qu''à se venger'
);

-- ────────────────────── et l'appel direct est refusé, pas seulement caché ──
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2000, 5::smallint) $$,
         (select id from d)),
  'P0001', 'personne_bloquee',
  'cacher ne suffit pas : l''offre est REFUSÉE même en appelant la fonction à la main'
);

-- ───────────────────────────────────────── dans l'autre sens, pareil ──────
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;
select public.debloquer((select conducteur from f));

reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.bloquer((select passager from f));

select is(
  (select count(*)::integer from public.demandes_proches(3000) where id = (select id from d)),
  0,
  'peu importe qui a bloqué : les deux cessent de se voir'
);

-- Le passager, lui, ne verrait pas une offre de ce conducteur.
reset role;
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.offres_recues),
  0,
  'et le passager ne reçoit aucune offre de qui l''a bloqué'
);

select throws_ok(
  format($$ select public.debloquer(%L) $$, (select conducteur from f)),
  'P0001', 'blocage_introuvable',
  'on ne défait que SON blocage : celui d''en face reste'
);

-- ──────────────────────────── une course ne se crée pas non plus ──────────
reset role;
select throws_ok(
  format($$
    insert into public.rides (demande_id, offre_id, passager_id, conducteur_id,
                              vehicule_id, prix_convenu_xof)
    select %L, gen_random_uuid(), %L, %L,
           (select id from public.vehicles where conducteur_id = %L), 2000
  $$, (select id from d), (select passager from f), (select conducteur from f),
      (select conducteur from f)),
  'P0001', 'personne_bloquee',
  'et aucune course ne se crée entre deux personnes qui se sont coupées'
);

-- ────────────────────────────────────── débloquer rouvre la porte ─────────
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.debloquer((select passager from f));

select is(
  (select count(*)::integer from public.demandes_proches(3000) where id = (select id from d)),
  1,
  'débloquer rouvre la file — le blocage n''est pas définitif'
);

select * from finish();
rollback;
