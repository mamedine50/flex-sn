-- L'appariement par proximité : st_dwithin trouve une demande à 2 km, pas à 4 km.
--
-- Et il le fait sur la MAILLE, pas sur le point exact. Un rayon choisi par
-- l'appelant plus une réponse oui/non permettent de trianguler : trois requêtes
-- à trois rayons cernent le point. Filtrer sur la maille n'apprend rien de plus
-- que ce que la maille montre déjà.
begin;
create extension if not exists pgtap with schema public;

select plan(9);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

create function public.t_utilisateur(
  p_prenom text, p_role public.role_utilisateur default 'passager'
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles
  set role = p_role,
      prenom = p_prenom,
      documents_valides_le = case when p_role = 'conducteur' then now() end
  where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select
  public.t_utilisateur('Awa') as proche,
  public.t_utilisateur('Fatou') as loin,
  public.t_utilisateur('Modou', 'conducteur') as conducteur;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-7777-GG', 'Toyota Corolla', 'blanche' from f;

-- Le conducteur est au Plateau. Deux demandes plein nord : 2 km et 4 km.
select public.t_devenir((select proche from f));
set local role authenticated;
create temp table d_proche as
select * from public.create_ride_request('urbain', 14.71077, -17.4467, 'Fann',
                                         14.75, -17.38, 'Yoff', 2500);
set local role postgres;

select public.t_devenir((select loin from f));
set local role authenticated;
create temp table d_loin as
select * from public.create_ride_request('urbain', 14.72873, -17.4467, 'Grand Yoff',
                                         14.76, -17.39, 'Ngor', 2500);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select is(
  (select en_ligne from public.maj_position(14.6928, -17.4467)),
  true,
  'le conducteur se met en ligne avec sa position'
);

-- ------------------------------------------------------- rayon de 3 km --
select isnt_empty(
  format($$ select 1 from public.demandes_proches(3000) where id = %L $$,
         (select id from d_proche)),
  'la demande à 2 km est trouvée'
);

select is_empty(
  format($$ select 1 from public.demandes_proches(3000) where id = %L $$,
         (select id from d_loin)),
  'la demande à 4 km ne l''est pas'
);

-- ------------------------------------------------------- rayon de 5 km --
select is(
  (select count(*)::int from public.demandes_proches(5000)),
  2,
  'à 5 km, les deux demandes remontent'
);

select is(
  (select id from public.demandes_proches(5000) limit 1),
  (select id from d_proche),
  'la plus proche remonte en premier'
);

-- La file de proximité ne sert rien de plus que la file ordinaire : mêmes
-- colonnes, donc aucune fuite ajoutée par le filtre géographique.
select is(
  (select zone_depart_lat from public.demandes_proches(5000) where id = (select id from d_proche)),
  public.arrondir_zone(14.71077::double precision),
  'la file de proximité rend la maille, pas le point'
);

set local role postgres;

-- ---------------------------------------------- ce sur quoi porte le filtre --
select ok(
  (select extensions.st_distance(depart_geo, zone_depart_geo) > 0
   from public.ride_requests where id = (select id from d_proche)),
  'le point exact et la maille sont deux colonnes distinctes'
);

select has_index('public', 'ride_requests', 'ride_requests_zone_depart_geo_gist',
  'la maille est indexée en GiST — sinon l''appariement balaie toute la table');

-- Hors ligne, plus de file : un conducteur qui a fini sa journée ne reçoit rien.
select public.t_devenir((select conducteur from f));
set local role authenticated;
select public.maj_position(14.6928, -17.4467, false);
select is_empty(
  $$ select 1 from public.demandes_proches(5000) $$,
  'un conducteur hors ligne ne voit aucune demande'
);
set local role postgres;

select * from finish();
rollback;
