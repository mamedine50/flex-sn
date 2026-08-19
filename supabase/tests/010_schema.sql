-- Le schéma tient-il ses promesses de structure : tables, RLS, index de garde.
begin;
create extension if not exists pgtap with schema public;

select plan(28);

-- Les cinq tables minimales, plus les bornes de prix.
select has_table('public', 'profiles', 'profiles existe');
select has_table('public', 'vehicles', 'vehicles existe');
select has_table('public', 'ride_requests', 'ride_requests existe');
select has_table('public', 'offers', 'offers existe');
select has_table('public', 'rides', 'rides existe');
select has_table('public', 'bornes_prix', 'bornes_prix existe');

-- RLS sur CHAQUE table. Sans exception : une table sans RLS est ouverte.
select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity),
  0,
  'aucune table publique sans RLS'
);

-- Aucune écriture directe : le client passe par les fonctions.
select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0,
  'ni anon ni authenticated ne peut écrire dans une table'
);

-- L'argent est un entier XOF, multiple de 100.
select col_type_is('public', 'ride_requests', 'prix_xof', 'integer', 'prix_xof est un entier');
select col_type_is('public', 'offers', 'prix_xof', 'integer', 'prix_xof d''une offre est un entier');
select col_type_is('public', 'rides', 'prix_convenu_xof', 'integer', 'le prix convenu est un entier');

-- Le pas de 100 F est tenu par la base, pas seulement par les boutons − / +.
select col_has_check('public', 'ride_requests', 'prix_xof',
  'le prix d''une demande porte une contrainte (> 0, multiple de 100)');
select col_has_check('public', 'offers', 'prix_xof',
  'le prix d''une offre porte une contrainte');

-- Les gardes de dernier recours.
select has_index('public', 'rides', 'rides_conducteur_actif_unique',
  'un conducteur ne peut avoir deux courses actives');
select has_index('public', 'ride_requests', 'ride_requests_passager_ouverte_unique',
  'un passager ne peut avoir deux demandes ouvertes');
select has_index('public', 'offers', 'offers_demande_conducteur_unique',
  'un conducteur ne répond qu''une fois à une demande');
select has_index('public', 'vehicles', 'vehicles_conducteur_actif_unique',
  'un conducteur n''a qu''un véhicule actif');

-- Les vues publiques ne portent AUCUNE colonne confidentielle.
select hasnt_column('public', 'profils_publics', 'nom_complet',
  'profils_publics ne porte pas le nom complet');
select hasnt_column('public', 'profils_publics', 'telephone',
  'profils_publics ne porte pas le téléphone');
select hasnt_column('public', 'vehicules_publics', 'plaque',
  'vehicules_publics ne porte pas la plaque');
select hasnt_column('public', 'demandes_ouvertes', 'depart_lat',
  'demandes_ouvertes ne porte pas la latitude exacte du départ');
select hasnt_column('public', 'demandes_ouvertes', 'depart_lon',
  'demandes_ouvertes ne porte pas la longitude exacte du départ');
select hasnt_column('public', 'demandes_ouvertes', 'depart_libelle',
  'demandes_ouvertes ne porte pas le libellé du départ — souvent une adresse');

-- ------------------------------------------------- inventaire des exécutants --
-- Les droits par défaut de Supabase accordent `execute` à anon et authenticated
-- sur toute fonction créée dans `public`. Une fonction de déclencheur s'est déjà
-- retrouvée exposée en RPC à `anon` par ce mécanisme, sans que personne l'ait
-- voulu. Cet inventaire ferme la porte par défaut : le prochain oubli tombe ici,
-- pas dans une relecture d'advisors.
--
-- La liste blanche est VIDE et doit le rester tant qu'aucune fonction n'a de
-- raison explicite d'être appelée sans session.
select is(
  (select coalesce(string_agg(
            p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
            ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname <> all (array[]::text[])),
  '',
  'aucune fonction de public n''est exécutable par anon — liste blanche vide'
);

-- Même inventaire côté `authenticated`, mais avec une liste blanche : là, les
-- RPC métier ont une raison d'être appelées. Toute NOUVELLE entrée doit être
-- ajoutée sciemment ici, ce qui force à se poser la question.
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname <> all (array[
       'accept_offer', 'commune_la_plus_proche', 'create_ride_request',
       'demandes_proches', 'est_conducteur', 'maj_position', 'maj_profil',
       'prix_suggere', 'refuse_offer', 'submit_offer'
     ])),
  '',
  'seules les RPC métier listées sont exécutables par authenticated'
);

-- Les fonctions métier existent et expire_stale() n'est pas offerte au client.
select has_function('public', 'accept_offer', array['uuid'], 'accept_offer existe');
select ok(
  not has_function_privilege('authenticated', 'public.expire_stale()', 'execute'),
  'expire_stale() n''est pas accordée à authenticated'
);
select ok(
  has_function_privilege('authenticated', 'public.accept_offer(uuid)', 'execute'),
  'accept_offer() est accordée à authenticated'
);

select * from finish();
rollback;
