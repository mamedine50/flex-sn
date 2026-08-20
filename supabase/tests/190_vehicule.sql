-- Le véhicule du conducteur : ce qui ouvre vraiment la capacité de conduire.
begin;
create extension if not exists pgtap with schema public;

select plan(7);

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
select public.t_utilisateur('Cheikh') as candidat,
       public.t_utilisateur('Awa') as autre;
grant select on f to authenticated;

-- Les quatre pièces validées, et RIEN d'autre.
insert into public.documents_conducteur (profil_id, type, chemin)
select candidat, t, candidat || '/' || t || '.jpg'
from f, unnest(array['piece_identite', 'permis', 'carte_grise', 'selfie']::public.type_document[]) t;

select public.decider_document((select candidat from f), t, true)
from unnest(array['piece_identite', 'permis', 'carte_grise', 'selfie']::public.type_document[]) t;

-- C'EST LE DÉFAUT : dossier complet, et pourtant rien d'ouvert.
select is(public.est_conducteur((select candidat from f)), false,
  'quatre pièces validées ne suffisent pas : sans véhicule, on ne conduit pas');

select public.t_devenir((select candidat from f));
set local role authenticated;

select throws_ok(
  $$ select public.declarer_vehicule('DK', 'Kia Picanto', 'grise') $$,
  'P0001', 'plaque_invalide',
  'une plaque de deux caractères n''est pas une plaque'
);

select lives_ok(
  $$ select public.declarer_vehicule(' dk-1234-a ', 'Kia Picanto', 'grise') $$,
  'on déclare son véhicule'
);

reset role;
select is(
  (select plaque from public.vehicles
   where conducteur_id = (select candidat from f) and actif),
  'DK-1234-A',
  'la plaque est normalisée : espaces retirés, majuscules — sinon « dk-1234-a » et « DK-1234-A » sont deux voitures'
);

select is(public.est_conducteur((select candidat from f)), true,
  'documents validés ET véhicule actif : la capacité s''ouvre');

-- Un deuxième véhicule remplace le premier : un seul actif à la fois.
select public.t_devenir((select candidat from f));
set local role authenticated;
select public.declarer_vehicule('DK-9999-B', 'Toyota Yaris', 'blanche');

reset role;
select is(
  (select count(*)::integer from public.vehicles
   where conducteur_id = (select candidat from f) and actif),
  1,
  'redéclarer remplace : un conducteur n''a qu''un véhicule actif'
);

-- La plaque active d'un autre ne se reprend pas.
select public.t_devenir((select autre from f));
set local role authenticated;
select throws_ok(
  $$ select public.declarer_vehicule('DK-9999-B', 'Toyota Yaris', 'blanche') $$,
  'P0001', 'plaque_prise',
  'deux comptes ne présentent pas la même voiture'
);

select * from finish();
rollback;
