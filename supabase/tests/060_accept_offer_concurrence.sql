-- LE test de l'étape 2 : deux acceptations concurrentes sur le MÊME conducteur,
-- une seule passe.
--
-- Pourquoi dblink plutôt qu'un test ordinaire : une transaction pgTAP ne voit
-- qu'elle-même. Prouver un verrou demande deux transactions RÉELLES qui se
-- disputent la même ligne au même instant. On ouvre donc deux connexions, on
-- les fait se croiser, et on regarde laquelle attend.
--
-- Les fixtures passent aussi par dblink : elles doivent être COMMITTÉES pour
-- que les deux connexions les voient. D'où le nettoyage explicite à la fin —
-- et au début, au cas où un run précédent se serait arrêté au milieu.
begin;
create extension if not exists pgtap with schema public;
create extension if not exists dblink with schema public;

select plan(6);

-- La chaîne de connexion se calcule : dblink refuse une connexion sans mot de
-- passe pour un rôle non-superutilisateur, et `postgres` n'en est pas un chez
-- Supabase. Or 127.0.0.1 est en `trust` dans pg_hba — donc sans mot de passe.
-- On repasse par l'adresse réseau du serveur, qui elle exige scram.
create function public.t_conninfo() returns text language sql as $$
  select format('dbname=%s user=postgres password=postgres host=%s port=%s',
                current_database(),
                host(inet_server_addr()),
                inet_server_port());
$$;

create function public.t_resultat_c2() returns text language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.dblink_get_result('c2') as t(id uuid);
  return 'succes';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

select public.dblink_connect('svc', public.t_conninfo());

-- ------------------------------------------------------------- fixtures --
-- Identifiants fixes : les trois connexions doivent parler des mêmes lignes.
select public.dblink_exec('svc', $svc$
  delete from public.rides where conducteur_id = '10000000-0000-4000-8000-000000000003';
  delete from public.offers where conducteur_id = '10000000-0000-4000-8000-000000000003';
  delete from public.ride_requests where passager_id in (
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
  delete from auth.users where id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003');
$svc$);

select public.dblink_exec('svc', $svc$
  insert into auth.users (id, email) values
    ('10000000-0000-4000-8000-000000000001', 'awa-conc@flex.test'),
    ('10000000-0000-4000-8000-000000000002', 'fatou-conc@flex.test'),
    ('10000000-0000-4000-8000-000000000003', 'modou-conc@flex.test');

  -- Le déclencheur les a déjà créées à l'insertion dans auth.users.
  update public.profiles set prenom = 'Awa'
   where id = '10000000-0000-4000-8000-000000000001';
  update public.profiles set prenom = 'Fatou'
   where id = '10000000-0000-4000-8000-000000000002';
  update public.profiles set prenom = 'Modou', role = 'conducteur',
         documents_valides_le = now()
   where id = '10000000-0000-4000-8000-000000000003';

  insert into public.vehicles (id, conducteur_id, plaque, modele, couleur) values
    ('20000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000003', 'DK-CONC-01', 'Toyota Corolla', 'blanche');

  -- Deux demandes, deux passagers différents.
  insert into public.ride_requests
    (id, passager_id, service, depart_lat, depart_lon, depart_libelle,
     destination_lat, destination_lon, destination_libelle, prix_xof, expires_at)
  values
    ('30000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000001', 'urbain',
     14.6928, -17.4467, 'Plateau', 14.7167, -17.4677, 'Ouakam', 2500,
     now() + interval '5 minutes'),
    ('30000000-0000-4000-8000-000000000002',
     '10000000-0000-4000-8000-000000000002', 'urbain',
     14.7000, -17.4400, 'Fann', 14.7500, -17.3800, 'Yoff', 3000,
     now() + interval '5 minutes');

  -- Le MÊME conducteur a répondu aux deux.
  insert into public.offers
    (id, demande_id, conducteur_id, vehicule_id, type, prix_xof,
     delai_arrivee_min, expires_at)
  values
    ('40000000-0000-4000-8000-000000000001',
     '30000000-0000-4000-8000-000000000001',
     '10000000-0000-4000-8000-000000000003',
     '20000000-0000-4000-8000-000000000001', 'acceptation', 2500, 4,
     now() + interval '2 minutes'),
    ('40000000-0000-4000-8000-000000000002',
     '30000000-0000-4000-8000-000000000002',
     '10000000-0000-4000-8000-000000000003',
     '20000000-0000-4000-8000-000000000001', 'acceptation', 3000, 5,
     now() + interval '2 minutes');
$svc$);

select is(
  (select n from public.dblink('svc', $svc$
     select count(*)::int from public.offers
     where conducteur_id = '10000000-0000-4000-8000-000000000003'
       and statut = 'en_attente'
   $svc$) as t(n int)),
  2,
  'deux offres en attente, du même conducteur, sur deux demandes différentes'
);

-- ------------------------------------------------- les deux acceptations --
select public.dblink_connect('c1', public.t_conninfo());
select public.dblink_connect('c2', public.t_conninfo());

-- Si le verrou n'était jamais rendu, c2 doit échouer plutôt que pendre.
select public.dblink_exec('c2', $svc$ set lock_timeout = '15s' $svc$);

-- c1 : Awa accepte. La transaction reste OUVERTE, verrou tenu.
select public.dblink_exec('c1', 'begin');
select x from public.dblink('c1', $svc$
  select set_config('request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true)
$svc$) as t(x text);

select isnt(
  (select id from public.dblink('c1', $svc$
     select id from public.accept_offer('40000000-0000-4000-8000-000000000001')
   $svc$) as t(id uuid)),
  null,
  'la première acceptation crée la course'
);

-- c2 : Fatou accepte, au même instant, une offre du même conducteur.
select public.dblink_exec('c2', 'begin');
select x from public.dblink('c2', $svc$
  select set_config('request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}', true)
$svc$) as t(x text);

select public.dblink_send_query('c2', $svc$
  select id from public.accept_offer('40000000-0000-4000-8000-000000000002')
$svc$);

select pg_sleep(0.7);

-- LA preuve. Si `accept_offer()` ne verrouillait pas, c2 aurait déjà répondu.
select is(
  public.dblink_is_busy('c2'),
  1,
  'la seconde acceptation ATTEND : le verrou sur le conducteur est bien tenu'
);

-- c1 relâche.
select public.dblink_exec('c1', 'commit');

-- c2 repart, relit, et voit la course de c1.
select matches(
  public.t_resultat_c2(),
  'conducteur_indisponible',
  'la seconde acceptation est refusée — et refusée pour la bonne raison'
);

select public.dblink_disconnect('c1');
select public.dblink_disconnect('c2');

-- ------------------------------------------------------------- l'état final --
select is(
  (select n from public.dblink('svc', $svc$
     select count(*)::int from public.rides
     where conducteur_id = '10000000-0000-4000-8000-000000000003'
       and statut in ('verrouillee', 'en_cours')
   $svc$) as t(n int)),
  1,
  'une seule course, pas deux'
);

-- La demande perdante n'a pas été abîmée : elle reste ouverte, un autre
-- conducteur peut encore la prendre. Fatou ne perd pas sa course.
select is(
  (select s from public.dblink('svc', $svc$
     select statut::text from public.ride_requests
     where id = '30000000-0000-4000-8000-000000000002'
   $svc$) as t(s text)),
  'ouverte',
  'la demande de la perdante reste ouverte pour un autre conducteur'
);

-- ------------------------------------------------------------- nettoyage --
select public.dblink_exec('svc', $svc$
  delete from public.rides where conducteur_id = '10000000-0000-4000-8000-000000000003';
  delete from public.offers where conducteur_id = '10000000-0000-4000-8000-000000000003';
  delete from public.ride_requests where passager_id in (
    '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
  delete from auth.users where id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003');
$svc$);
select public.dblink_disconnect('svc');

select * from finish();
rollback;
