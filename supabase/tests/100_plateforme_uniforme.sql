-- Plateforme uniforme : conduire est une capacité, pas un type de compte.
--
-- Le test qui compte est le dernier : un profil dont `role` dit « passager »
-- mais qui a documents et véhicule PEUT conduire. C'est la preuve que la colonne
-- `role` n'est plus consultée nulle part. Tant qu'elle l'était, un conducteur qui
-- voulait commander une course ouvrait un second compte — et un second compte
-- vide la note, l'historique et le blocage réciproque de leur sens.
begin;
create extension if not exists pgtap with schema public;

select plan(14);

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create function public.t_brut(p_prenom text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles set prenom = p_prenom where id = v_id;
  return v_id;
end; $$;

create temp table f as
select
  public.t_brut('Awa') as simple,
  public.t_brut('Modou') as complet,      -- documents + véhicule
  public.t_brut('Cheikh') as sans_papiers, -- véhicule seul
  public.t_brut('Ibrahima') as sans_voiture, -- documents seuls
  public.t_brut('Ndeye') as capable;      -- documents + véhicule, `role` par défaut
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select complet, 'DK-8888-HH', 'Toyota Corolla', 'blanche' from f;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select sans_papiers, 'DK-9999-II', 'Hyundai Accent', 'grise' from f;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select capable, 'DK-1010-JJ', 'Renault Logan', 'bleue' from f;

update public.profiles set documents_valides_le = now()
where id in ((select complet from f), (select sans_voiture from f),
             (select capable from f));

-- ------------------------------------------------------- est_conducteur() --
select is(public.est_conducteur((select simple from f)), false,
  'ni documents ni véhicule : pas conducteur');
select is(public.est_conducteur((select sans_papiers from f)), false,
  'une voiture sans papiers ne conduit personne');
select is(public.est_conducteur((select sans_voiture from f)), false,
  'des papiers sans voiture non plus');
select is(public.est_conducteur((select complet from f)), true,
  'documents validés ET véhicule actif : conducteur');

-- `role` ne décide plus de rien : les quatre profils ont la valeur par défaut.
select is(
  (select count(distinct role)::int from public.profiles
   where id in (select complet from f) or id in (select simple from f)),
  1,
  'les deux profils ont le même `role` — ce n''est plus lui qui tranche'
);

-- ------------------------------- un conducteur commande avec le même compte --
select public.t_devenir((select complet from f));
set local role authenticated;

create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467,
  'Rue Carnot 12, Plateau', 14.7220, -17.4900, 'Ouakam', 2500);

select is((select statut from d)::text, 'ouverte',
  'un conducteur peut commander une course avec son compte de conducteur');

select is_empty(
  format($$ select 1 from public.demandes_ouvertes where id = %L $$, (select id from d)),
  'et sa propre demande n''apparaît pas dans sa file de conducteur'
);

-- Il ne répond pas non plus à sa propre demande s'il en connaît l'identifiant.
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'demande_a_soi',
  'on ne prend pas sa propre course'
);
set local role postgres;

-- ------------------------------------- la file suit la capacité, pas le rôle --
select public.t_devenir((select simple from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.demandes_ouvertes $$,
  'un compte sans capacité ne voit pas la file'
);
set local role postgres;

select public.t_devenir((select sans_voiture from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.demandes_ouvertes $$,
  'des papiers sans voiture ne donnent pas accès à la file'
);
set local role postgres;

select public.t_devenir((select capable from f));
set local role authenticated;
select isnt_empty(
  $$ select 1 from public.demandes_ouvertes $$,
  'un compte dont `role` dit « passager » mais qui a la capacité VOIT la file'
);

-- ------------------------------------------------------------- communes --
select is(
  (select destination_commune from public.demandes_ouvertes where id = (select id from d)),
  'Ouakam',
  'la file nomme la commune de destination'
);

select ok(
  (select depart_commune is not null from public.demandes_ouvertes
   where id = (select id from d)),
  'la file nomme la commune de départ — le conducteur sait où il va'
);

select is_empty(
  format($$ select 1 from public.demandes_ouvertes
            where id = %L and depart_commune = 'Rue Carnot 12, Plateau' $$,
         (select id from d)),
  'et jamais le texte libre du passager'
);
set local role postgres;

select * from finish();
rollback;
