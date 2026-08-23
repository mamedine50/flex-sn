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
-- La liste blanche porte UNE entrée, et il faut une raison écrite pour en
-- ajouter une : `prix_suggere()` est l'arithmétique d'une grille publique sur
-- deux points que l'appelant fournit — elle ne rend aucune ligne appartenant à
-- quiconque, et sans elle l'écran « Fixez votre prix » est inconsultable sans
-- compte, ce qui contredit la règle du parcours.
select is(
  (select coalesce(string_agg(
            p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
            ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'execute')
     and p.proname <> all (array['prix_suggere']::text[])),
  '',
  'aucune fonction de public n''est exécutable par anon hors liste blanche'
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
       -- Les RPC métier.
       'accept_offer', 'annuler_course', 'annuler_demande', 'avancer_course',
       'bloquer', 'debloquer',
       'decider_document', 'dossier_du_candidat',
       'commune_la_plus_proche', 'contre_proposer', 'create_ride_request',
       'declarer_vehicule',
       -- Les durées se lisent en base depuis qu'elles se règlent sans
       -- migration : les fonctions qui les servent doivent donc être
       -- appelables, comme `prix_suggere` l'est pour la grille de prix.
       'duree_demande', 'duree_offre',
       'demandes_proches',
       -- Un jeton push s'enregistre et s'oublie depuis l'appareil : ces deux-là
       -- n'agissent que sur `auth.uid()` et ne prennent aucune cible.
       'enregistrer_jeton_push', 'oublier_jeton_push',
       'enregistrer_lieu_favori', 'envoyer_message',
       'est_admin', 'est_conducteur', 'maj_photo_profil',
       'maj_position', 'maj_profil', 'marquer_notifications_lues',
       'noter_course', 'prix_suggere', 'refuse_offer', 'signaler',
       'soumettre_document', 'submit_offer', 'supprimer_lieu_favori',
       -- Fermer son compte et signaler quelqu'un sont des droits de la personne,
       -- pas des privilèges : `suppression_possible` répond à une question sur
       -- SOI, `supprimer_mon_compte` n'agit que sur `auth.uid()`, et `signaler`
       -- exige une course commune. Aucune ne prend d'identifiant de cible.
       'suppression_possible', 'supprimer_mon_compte',
       -- Ni RPC ni utilitaires internes : celles-ci sont appelées DEPUIS des
       -- policies RLS ou DEPUIS des vues, et Postgres vérifie ces appels contre
       -- celui qui interroge — pas contre le propriétaire. Sans le droit, la
       -- lecture échoue en « permission denied for function ».
       'course_active', 'course_en_deplacement', 'arrondir_zone', 'est_bloque',
       'taille_cellule_deg', 'delai_double_aveugle', 'seuil_nouveau_conducteur',
       'courses_terminees', 'courses_comme_conducteur',
       'est_nouveau_conducteur'
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
