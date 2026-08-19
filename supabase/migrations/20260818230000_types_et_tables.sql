-- Flex — types et tables.
--
-- Migrations en ajout seul : ce fichier ne sera jamais modifié une fois appliqué.
--
-- Toute somme est un entier XOF, multiple de 100 — le pas réel de la monnaie.
-- La contrainte est en base parce qu'un client peut mentir.

create type public.role_utilisateur as enum ('passager', 'conducteur');
create type public.service_course as enum ('urbain', 'interurbain');
create type public.statut_demande as enum ('ouverte', 'verrouillee', 'expiree', 'annulee');
create type public.type_offre as enum ('acceptation', 'contre_offre');
create type public.statut_offre as enum (
  'en_attente',
  'acceptee',
  'refusee',
  'expiree',
  'caduque' -- une autre offre a verrouillé la demande
);
create type public.statut_course as enum ('verrouillee', 'en_cours', 'terminee', 'annulee');

-- ---------------------------------------------------------------- profiles --
-- `prenom` est public. `nom_complet` et `telephone` ne le sont jamais avant
-- acceptation : aucune vue publique ne les expose, et la policy de `profiles`
-- ne les sert qu'à la contrepartie d'une course verrouillée.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.role_utilisateur not null default 'passager',
  prenom text not null check (length(btrim(prenom)) between 1 and 40),
  nom_complet text check (length(btrim(nom_complet)) between 1 and 120),
  telephone text check (telephone ~ '^\+221[0-9]{9}$'),
  photo_url text,
  langue text not null default 'fr' check (langue in ('fr', 'en', 'wo')),
  note_moyenne numeric(2, 1) check (note_moyenne between 1.0 and 5.0),
  nb_notes integer not null default 0 check (nb_notes >= 0),
  cree_le timestamptz not null default now()
);

comment on column public.profiles.nom_complet is
  'Confidentiel. Jamais servi à un conducteur avant acceptation.';
comment on column public.profiles.telephone is
  'Confidentiel. Jamais servi à un conducteur avant acceptation.';

-- ---------------------------------------------------------------- vehicles --
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  conducteur_id uuid not null references public.profiles (id) on delete cascade,
  plaque text not null check (length(btrim(plaque)) between 4 and 16),
  modele text not null check (length(btrim(modele)) between 2 and 60),
  couleur text not null check (length(btrim(couleur)) between 2 and 30),
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

-- Une plaque n'appartient qu'à un véhicule, quelle que soit la casse saisie.
create unique index vehicles_plaque_unique on public.vehicles (upper(btrim(plaque)));

-- Un conducteur ne conduit qu'un véhicule à la fois.
create unique index vehicles_conducteur_actif_unique
  on public.vehicles (conducteur_id) where actif;

-- ----------------------------------------------------------- ride_requests --
create table public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  passager_id uuid not null references public.profiles (id) on delete cascade,
  service public.service_course not null,

  depart_lat double precision not null check (depart_lat between -90 and 90),
  depart_lon double precision not null check (depart_lon between -180 and 180),
  depart_libelle text not null check (length(btrim(depart_libelle)) between 2 and 120),

  destination_lat double precision not null check (destination_lat between -90 and 90),
  destination_lon double precision not null check (destination_lon between -180 and 180),
  destination_libelle text not null check (length(btrim(destination_libelle)) between 2 and 120),

  prix_xof integer not null check (prix_xof > 0 and prix_xof % 100 = 0),

  statut public.statut_demande not null default 'ouverte',
  expires_at timestamptz not null,
  cree_le timestamptz not null default now(),
  verrouillee_le timestamptz
);

-- Un passager n'a qu'une demande ouverte : sans ça il inonde les conducteurs.
create unique index ride_requests_passager_ouverte_unique
  on public.ride_requests (passager_id) where statut = 'ouverte';

create index ride_requests_a_expirer on public.ride_requests (expires_at)
  where statut = 'ouverte';

-- ------------------------------------------------------------------ offers --
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null references public.ride_requests (id) on delete cascade,
  conducteur_id uuid not null references public.profiles (id) on delete cascade,
  vehicule_id uuid not null references public.vehicles (id),
  type public.type_offre not null,
  prix_xof integer not null check (prix_xof > 0 and prix_xof % 100 = 0),
  delai_arrivee_min smallint not null check (delai_arrivee_min between 0 and 180),
  statut public.statut_offre not null default 'en_attente',
  expires_at timestamptz not null,
  cree_le timestamptz not null default now()
);

-- Un conducteur ne répond qu'une fois à une demande tant qu'il attend.
create unique index offers_demande_conducteur_unique
  on public.offers (demande_id, conducteur_id) where statut = 'en_attente';

create index offers_par_demande on public.offers (demande_id, cree_le desc);

create index offers_a_expirer on public.offers (expires_at) where statut = 'en_attente';

-- ------------------------------------------------------------------- rides --
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  demande_id uuid not null unique references public.ride_requests (id),
  offre_id uuid not null unique references public.offers (id),
  passager_id uuid not null references public.profiles (id),
  conducteur_id uuid not null references public.profiles (id),
  vehicule_id uuid not null references public.vehicles (id),
  prix_convenu_xof integer not null
    check (prix_convenu_xof > 0 and prix_convenu_xof % 100 = 0),
  statut public.statut_course not null default 'verrouillee',
  verrouillee_le timestamptz not null default now(),
  terminee_le timestamptz,
  check (statut <> 'terminee' or terminee_le is not null)
);

-- Ceinture ET bretelles du verrouillage : `accept_offer()` prend un verrou de
-- ligne sur le conducteur, et cet index refuse quand même une deuxième course
-- active. Si la logique se troue un jour, la base tient encore.
create unique index rides_conducteur_actif_unique
  on public.rides (conducteur_id) where statut in ('verrouillee', 'en_cours');

-- ------------------------------------------------------------- bornes_prix --
-- Les bornes sont des données, pas du code : l'écran « Fixez votre prix » les
-- lit pour afficher sa fourchette, et `create_ride_request()` les applique.
-- Une seule source, donc pas de dérive entre l'indication et le refus.
create table public.bornes_prix (
  service public.service_course primary key,
  min_xof integer not null check (min_xof > 0 and min_xof % 100 = 0),
  max_xof integer not null check (max_xof > 0 and max_xof % 100 = 0),
  check (max_xof > min_xof)
);

insert into public.bornes_prix (service, min_xof, max_xof) values
  ('urbain', 500, 15000),
  ('interurbain', 2000, 60000);
