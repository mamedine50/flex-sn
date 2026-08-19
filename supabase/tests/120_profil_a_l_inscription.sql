-- Un compte fraîchement inscrit a un profil, sinon il ne peut rien faire.
begin;
create extension if not exists pgtap with schema public;

select plan(8);

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

-- ------------------------------------------- inscription sans métadonnées --
insert into auth.users (id, email)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'sans-meta@flex.test');

select is(
  (select prenom from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Passager',
  'un compte sans prénom reçoit quand même un profil'
);

-- ------------------------------------------- inscription avec métadonnées --
insert into auth.users (id, email, phone, raw_user_meta_data)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'awa@flex.test', '221771234567',
        '{"prenom":"Awa"}'::jsonb);

select is(
  (select prenom from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'Awa',
  'le prénom des métadonnées est repris'
);

select is(
  (select telephone from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  '+221771234567',
  'le numéro est normalisé au format international'
);

-- Un numéro d'un autre pays ne doit pas faire échouer l'inscription.
insert into auth.users (id, email, phone)
values ('aaaaaaaa-0000-4000-8000-000000000003', 'etranger@flex.test', '33612345678');

select ok(
  (select telephone is null from public.profiles
   where id = 'aaaaaaaa-0000-4000-8000-000000000003'),
  'un numéro hors Sénégal laisse le champ vide plutôt que de bloquer l''inscription'
);

-- ------------------------------- le nouvel inscrit peut poser une demande --
select public.t_devenir('aaaaaaaa-0000-4000-8000-000000000002');
set local role authenticated;

select isnt_empty(
  $$ select 1 from public.create_ride_request('urbain', 14.6928, -17.4467, 'Plateau',
                                              14.7220, -17.4900, 'Ouakam', 2500) $$,
  'un compte fraîchement inscrit peut créer une demande'
);

-- ------------------------------------------------------------ maj_profil --
select is(
  (select prenom from public.maj_profil(p_prenom => 'Awa Ndiaye')),
  'Awa Ndiaye',
  'on complète son propre prénom'
);

select throws_ok(
  $$ select public.maj_profil(p_langue => 'es') $$,
  'P0001', 'langue_inconnue',
  'une langue inconnue est refusée'
);
set local role postgres;

-- On ne se décerne ni un rôle ni des documents validés : `maj_profil` ne les
-- expose pas, et c'est vérifié par l'absence des paramètres.
select is(
  (select count(*)::int from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'maj_profil%'
     and parameter_name in ('p_role', 'p_documents_valides_le', 'p_note_moyenne')),
  0,
  'maj_profil n''expose ni rôle, ni documents, ni note — ça se gagne'
);

select * from finish();
rollback;
