-- Flex — les lieux qu'on cherche.
--
-- FORME RETENUE : une table `lieux` unique avec une colonne `categorie`, et la
-- table `communes` laissée SÉPARÉE. C'est la commune qu'on sert au conducteur
-- avant acceptation et jamais un lieu : la séparation physique rend la confusion
-- impossible. Quartiers et points d'intérêt, eux, partagent le même usage — la
-- recherche, et rien d'autre — et méritent donc une seule table.
--
-- Rien de cette table n'est JAMAIS servi au conducteur avant acceptation. Un
-- passager qui part du Radisson apparaît « vers Almadies », point. Une assertion
-- de 080 le prouve si le chemin des données change.
--
-- Données © contributeurs OpenStreetMap, sous ODbL. Extraction unique par
-- `scripts/extraire-lieux-osm.mjs` — aucun appel à un service de lieux au
-- runtime, jamais.
create type public.categorie_lieu as enum (
  'quartier', 'arret', 'aeroport', 'gare', 'stade', 'hotel', 'hopital',
  'universite', 'marche', 'centre_commercial', 'monument', 'lieu_culte'
);

create table public.lieux (
  code text primary key,
  nom text not null check (length(btrim(nom)) between 1 and 160),
  alias text[] not null default '{}',
  categorie public.categorie_lieu not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
    ) stored
);

create index lieux_geo_gist on public.lieux using gist (geo);
create index lieux_categorie on public.lieux (categorie);

comment on table public.lieux is
  'Quartiers et points de repère, pour la RECHERCHE uniquement. Jamais servi avant acceptation : ce que voit un conducteur reste la commune et la maille. Source OpenStreetMap (ODbL), extraction unique.';

alter table public.lieux enable row level security;
revoke all on public.lieux from anon, authenticated;
grant select on public.lieux to authenticated;

-- Publique pour un utilisateur connecté : c'est une nomenclature de lieux, elle
-- n'apprend rien sur personne.
create policy lieux_lecture on public.lieux
  for select to authenticated using (true);
