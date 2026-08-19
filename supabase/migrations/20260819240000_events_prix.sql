-- Flex — les journaux qui permettront de calibrer.
--
-- Une ligne par demande créée, écrite par `create_ride_request()` et complétée
-- par les fonctions au fil de la vie de la demande. JAMAIS par le client : ces
-- chiffres servent à décider d'un tarif, ils n'ont pas à être déclarés par la
-- partie qui a intérêt au résultat.

create table public.events_prix (
  demande_id uuid primary key
    references public.ride_requests (id) on delete cascade,
  service public.service_course not null,

  -- Ce que l'écran affichait au moment de la saisie. Seule valeur venue du
  -- client : lui seul sait ce qu'il a montré.
  recommandation_xof integer,
  prix_propose_xof integer not null,

  -- Le passager a-t-il touché au pré-rempli ? Calculé en base, pas déclaré.
  -- Sans recommandation il n'y avait rien à modifier, mais le prix est alors
  -- entièrement le sien — ce qui est plus informatif encore.
  prix_modifie boolean not null,

  maille_depart_lat double precision not null,
  maille_depart_lon double precision not null,
  maille_arrivee_lat double precision not null,
  maille_arrivee_lon double precision not null,
  distance_m integer not null,

  -- Complétés au fil de la négociation.
  nb_offres integer not null default 0,
  nb_contre_offres integer not null default 0,
  prix_convenu_xof integer,
  delai_premiere_offre_s integer,

  cree_le timestamptz not null default now()
);

comment on table public.events_prix is
  'Journal de calibrage tarifaire. Écrit par les fonctions RPC, jamais par le client. Mailles arrondies : on n''y garde aucune position exacte.';

create index events_prix_par_route on public.events_prix
  (maille_depart_lat, maille_depart_lon, maille_arrivee_lat, maille_arrivee_lon);

-- Lecture réservée à service_role. Ni anon ni authenticated : personne d'autre
-- n'a à lire ça, et la RLS active sans policy ferme la porte à double tour.
alter table public.events_prix enable row level security;
revoke all on public.events_prix from anon, authenticated;
grant select on public.events_prix to service_role;

-- --------------------------------------------------------- create_ride_request --
-- La signature change : on ne peut pas `create or replace`. Drop + create, donc
-- RE-GRANT OBLIGATOIRE — et une assertion pgTAP vérifie qu'`authenticated` peut
-- toujours l'exécuter. C'est invisible en local et ça casse en production.
drop function if exists public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer);

create function public.create_ride_request(
  p_service public.service_course,
  p_depart_lat double precision,
  p_depart_lon double precision,
  p_depart_libelle text,
  p_destination_lat double precision,
  p_destination_lon double precision,
  p_destination_libelle text,
  p_prix_xof integer,
  p_recommandation_xof integer default null
)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bornes public.bornes_prix;
  v_demande public.ride_requests;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profil_absent' using errcode = 'P0001';
  end if;

  if p_prix_xof % 100 <> 0 then
    raise exception 'prix_non_multiple_de_100'
      using errcode = 'P0001', detail = 'Le pas de prix est de 100 FCFA.';
  end if;

  select * into v_bornes from public.bornes_prix where service = p_service;

  if p_prix_xof < v_bornes.min_xof or p_prix_xof > v_bornes.max_xof then
    raise exception 'prix_hors_bornes'
      using errcode = 'P0001',
            detail = format('Attendu entre %s et %s XOF, reçu %s.',
                            v_bornes.min_xof, v_bornes.max_xof, p_prix_xof);
  end if;

  if exists (
    select 1 from public.ride_requests
    where passager_id = v_uid and statut = 'ouverte'
  ) then
    raise exception 'demande_deja_ouverte' using errcode = 'P0001';
  end if;

  insert into public.ride_requests (
    passager_id, service,
    depart_lat, depart_lon, depart_libelle,
    destination_lat, destination_lon, destination_libelle,
    prix_xof, expires_at
  ) values (
    v_uid, p_service,
    p_depart_lat, p_depart_lon, btrim(p_depart_libelle),
    p_destination_lat, p_destination_lon, btrim(p_destination_libelle),
    p_prix_xof, now() + public.duree_demande(p_service)
  )
  returning * into v_demande;

  -- Le journal. Mailles arrondies : aucune position exacte n'entre ici.
  insert into public.events_prix (
    demande_id, service, recommandation_xof, prix_propose_xof, prix_modifie,
    maille_depart_lat, maille_depart_lon, maille_arrivee_lat, maille_arrivee_lon,
    distance_m
  ) values (
    v_demande.id, p_service, p_recommandation_xof, p_prix_xof,
    p_recommandation_xof is null or p_recommandation_xof <> p_prix_xof,
    public.arrondir_zone(p_depart_lat), public.arrondir_zone(p_depart_lon),
    public.arrondir_zone(p_destination_lat), public.arrondir_zone(p_destination_lon),
    round(extensions.st_distance(
      extensions.st_setsrid(
        extensions.st_makepoint(p_depart_lon, p_depart_lat), 4326)::extensions.geography,
      extensions.st_setsrid(
        extensions.st_makepoint(p_destination_lon, p_destination_lat),
        4326)::extensions.geography))::integer
  );

  return v_demande;
end;
$$;

revoke all on function public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer, integer) to authenticated;
