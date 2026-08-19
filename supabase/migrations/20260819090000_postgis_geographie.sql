-- Flex — géographie.
--
-- L'appariement « les conducteurs à moins de 3 km » est le cœur du produit, pas
-- une option future. Sans index spatial c'est un balayage complet à chaque
-- demande. Posé maintenant, c'est une migration additive ; posé plus tard, c'est
-- une migration de colonnes avec des courses en cours.
--
-- PostGIS tourne DANS la base : ce n'est pas une API facturée. La règle
-- « affichage seul, ni Places ni Directions ni Geocoding » ne le concerne pas.
--
-- L'extension est posée dans `extensions`, pas dans `public` : PostGIS y crée la
-- table `spatial_ref_sys`, et une table dans `public` sans RLS ferait mentir la
-- garde « aucune table publique sans RLS ».
create extension if not exists postgis with schema extensions;

-- --------------------------------------------------- demandes : deux points --
-- `depart_geo` — le point EXACT. Sert après acceptation, et à l'exploitation.
-- `zone_depart_geo` — le centre de maille, celui qu'on sert avant.
--
-- Les deux sont dérivées de lat/lon : rien à synchroniser, rien à casser.
alter table public.ride_requests
  add column depart_geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(
        extensions.st_makepoint(depart_lon, depart_lat), 4326)::extensions.geography
    ) stored,
  add column zone_depart_geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(
        extensions.st_makepoint(
          public.arrondir_zone(depart_lon), public.arrondir_zone(depart_lat)),
        4326)::extensions.geography
    ) stored,
  add column destination_geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(
        extensions.st_makepoint(destination_lon, destination_lat), 4326)::extensions.geography
    ) stored;

create index ride_requests_depart_geo_gist
  on public.ride_requests using gist (depart_geo);

-- L'APPARIEMENT passe par la maille, jamais par le point exact.
--
-- Filtrer sur le point exact avec un rayon choisi par le conducteur laisserait
-- reconstruire la position par trilatération : trois positions, trois réponses
-- oui/non, et le point est cerné. Filtrer sur la maille ne dit rien de plus que
-- ce que la maille montre déjà.
create index ride_requests_zone_depart_geo_gist
  on public.ride_requests using gist (zone_depart_geo);

comment on column public.ride_requests.depart_geo is
  'Point EXACT. Ne JAMAIS s''en servir pour l''appariement : un rayon choisi par l''appelant plus une réponse oui/non se trilatèrent en trois essais. Pour filtrer, c''est zone_depart_geo.';

comment on column public.ride_requests.zone_depart_geo is
  'Maille servie avant acceptation. C''est CETTE colonne qui sert à l''appariement — le point exact permettrait une trilatération.';

-- ------------------------------------------------- position des conducteurs --
create table public.positions_conducteurs (
  conducteur_id uuid primary key references public.profiles (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
    ) stored,
  en_ligne boolean not null default false,
  maj_le timestamptz not null default now()
);

create index positions_conducteurs_geo_gist
  on public.positions_conducteurs using gist (geo) where en_ligne;

alter table public.positions_conducteurs enable row level security;
revoke all on public.positions_conducteurs from anon, authenticated;
grant select on public.positions_conducteurs to authenticated;

-- Le conducteur voit la sienne.
create policy positions_soi_meme on public.positions_conducteurs
  for select to authenticated
  using (conducteur_id = (select auth.uid()));

-- Le passager voit celle de SON conducteur, et seulement pendant la course :
-- c'est la voiture qui approche sur l'écran « En route ». Avant acceptation,
-- il ne suit personne.
create policy positions_passager_course_active on public.positions_conducteurs
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where c.conducteur_id = public.positions_conducteurs.conducteur_id
        and c.passager_id = (select auth.uid())
        and c.statut in ('verrouillee', 'en_cours')
    )
  );

-- Écriture par RPC, comme le reste.
create function public.maj_position(
  p_lat double precision,
  p_lon double precision,
  p_en_ligne boolean default true
)
returns public.positions_conducteurs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_position public.positions_conducteurs;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  insert into public.positions_conducteurs (conducteur_id, lat, lon, en_ligne, maj_le)
  values (v_uid, p_lat, p_lon, p_en_ligne, now())
  on conflict (conducteur_id) do update
    set lat = excluded.lat,
        lon = excluded.lon,
        en_ligne = excluded.en_ligne,
        maj_le = now()
  returning * into v_position;

  return v_position;
end;
$$;

revoke all on function public.maj_position(double precision, double precision, boolean)
  from public, anon, authenticated;
grant execute on function public.maj_position(double precision, double precision, boolean)
  to authenticated;
