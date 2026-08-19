-- Flex — communes, en local.
--
-- Un conducteur qui ne sait pas dans quel quartier il va refuse par défaut. Il
-- lui faut donc un nom de lieu avant d'accepter — mais jamais le texte libre du
-- passager, qui est souvent une adresse.
--
-- La table est STATIQUE et locale : aucun appel de reverse geocoding, qui est
-- facturé et que la V1 s'interdit.
--
-- Limite assumée : ce sont des CENTROÏDES approximatifs, pas des polygones
-- administratifs. L'attribution se fait au plus proche centroïde, ce qui est
-- juste au cœur d'une commune et flou à la frontière. À remplacer par les
-- limites réelles quand on les aura — la fonction ne changera pas de signature.
create table public.communes (
  code text primary key,
  nom text not null,
  region text not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
    ) stored
);

create index communes_geo_gist on public.communes using gist (geo);

alter table public.communes enable row level security;
revoke all on public.communes from anon, authenticated;
grant select on public.communes to authenticated;

-- Publique : c'est une nomenclature, elle n'apprend rien sur personne.
create policy communes_lecture on public.communes
  for select to authenticated using (true);

insert into public.communes (code, nom, region, lat, lon) values
  -- Dakar
  ('dk-plateau',      'Plateau',                  'Dakar',      14.6690, -17.4380),
  ('dk-medina',       'Médina',                   'Dakar',      14.6800, -17.4520),
  ('dk-fann',         'Fann–Point E–Amitié',      'Dakar',      14.6900, -17.4630),
  ('dk-gueule-tapee', 'Gueule Tapée–Fass–Colobane','Dakar',     14.6850, -17.4450),
  ('dk-grand-dakar',  'Grand Dakar',              'Dakar',      14.7050, -17.4550),
  ('dk-biscuiterie',  'Biscuiterie',              'Dakar',      14.7000, -17.4470),
  ('dk-hlm',          'HLM',                      'Dakar',      14.7100, -17.4450),
  ('dk-hann',         'Hann Bel-Air',             'Dakar',      14.7180, -17.4300),
  ('dk-sicap',        'Sicap-Liberté',            'Dakar',      14.7130, -17.4630),
  ('dk-dieuppeul',    'Dieuppeul-Derklé',         'Dakar',      14.7150, -17.4520),
  ('dk-mermoz',       'Mermoz–Sacré-Cœur',        'Dakar',      14.7050, -17.4750),
  ('dk-ouakam',       'Ouakam',                   'Dakar',      14.7220, -17.4900),
  ('dk-ngor',         'Ngor',                     'Dakar',      14.7480, -17.5130),
  ('dk-yoff',         'Yoff',                     'Dakar',      14.7530, -17.4730),
  ('dk-grand-yoff',   'Grand Yoff',               'Dakar',      14.7350, -17.4600),
  ('dk-patte-doie',   'Patte d''Oie',             'Dakar',      14.7420, -17.4450),
  ('dk-parcelles',    'Parcelles Assainies',      'Dakar',      14.7620, -17.4300),
  ('dk-camberene',    'Cambérène',                'Dakar',      14.7720, -17.4100),
  -- Banlieue
  ('pk-pikine',       'Pikine',                   'Pikine',     14.7550, -17.3900),
  ('pk-thiaroye',     'Thiaroye',                 'Pikine',     14.7600, -17.3600),
  ('pk-keur-massar',  'Keur Massar',              'Keur Massar',14.7800, -17.3200),
  ('gd-guediawaye',   'Guédiawaye',               'Guédiawaye', 14.7780, -17.3900),
  ('rf-rufisque',     'Rufisque',                 'Rufisque',   14.7150, -17.2700),
  ('rf-bargny',       'Bargny',                   'Rufisque',   14.6950, -17.2250),
  ('rf-diamniadio',   'Diamniadio',               'Rufisque',   14.7280, -17.1840),
  -- Interurbain : les destinations de la V1
  ('th-thies',        'Thiès',                    'Thiès',      14.7910, -16.9260),
  ('mb-mbour',        'Mbour',                    'Thiès',      14.4200, -16.9600),
  ('mb-saly',         'Saly',                     'Thiès',      14.4460, -17.0090),
  ('tb-touba',        'Touba',                    'Diourbel',   14.8500, -15.8800),
  ('sl-saint-louis',  'Saint-Louis',              'Saint-Louis',16.0180, -16.4890),
  ('kl-kaolack',      'Kaolack',                  'Kaolack',    14.1520, -16.0730),
  ('zg-ziguinchor',   'Ziguinchor',               'Ziguinchor', 12.5680, -16.2730);

-- Le nom de commune le plus proche, ou NULL au-delà du rayon. Sans le plafond,
-- un point au large de Dakar se verrait attribuer « Ngor » avec aplomb.
create function public.commune_la_plus_proche(
  p_lat double precision,
  p_lon double precision,
  p_rayon_max_m integer default 15000
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.nom
  from public.communes c
  where extensions.st_dwithin(
          c.geo,
          extensions.st_setsrid(
            extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography,
          p_rayon_max_m)
  -- `st_distance` plutôt que l'opérateur KNN `<->` : avec search_path vide, un
  -- opérateur d'un autre schéma ne se résout pas. Sur trente-deux communes le
  -- tri exact ne coûte rien, et le filtre `st_dwithin` utilise déjà l'index.
  order by extensions.st_distance(
             c.geo,
             extensions.st_setsrid(
               extensions.st_makepoint(p_lon, p_lat), 4326)::extensions.geography)
  limit 1;
$$;

revoke all on function public.commune_la_plus_proche(double precision, double precision, integer)
  from public, anon;
grant execute on function public.commune_la_plus_proche(double precision, double precision, integer)
  to authenticated;
