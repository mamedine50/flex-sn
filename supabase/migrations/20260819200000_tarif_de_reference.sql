-- Flex — tarif de référence, pour ouvrir le champ sur un prix crédible.
--
-- Le passager fixe son prix, ça ne change pas. Mais ouvrir le champ sur la borne
-- basse — 500 F, quelle que soit la distance — fait envoyer 500 F pour onze
-- kilomètres, ne reçoit aucune réponse, et la première expérience de Flex est le
-- silence. Un pré-remplissage n'est pas une contrainte : c'est un point de départ.
--
-- Les colonnes sont NULLABLES et volontairement VIDES à cette migration. Tant
-- qu'on n'a pas de tarifs réels de Dakar, `prix_suggere()` rend NULL et le champ
-- s'ouvre vide en exigeant une saisie. Un champ vide est honnête ; un chiffre
-- inventé présenté comme une suggestion est un piège.
alter table public.bornes_prix
  add column prix_base_xof integer
    check (prix_base_xof is null or prix_base_xof > 0),
  add column prix_km_xof integer
    check (prix_km_xof is null or prix_km_xof > 0);

comment on column public.bornes_prix.prix_base_xof is
  'Part fixe du tarif de référence, en XOF. NULL tant qu''on n''a pas de valeurs réelles — prix_suggere() rend alors NULL.';
comment on column public.bornes_prix.prix_km_xof is
  'Part kilométrique du tarif de référence, en XOF par km. Voir prix_suggere() : la distance est à vol d''oiseau, plus courte que la route — en tenir compte en calibrant.';

-- Prix suggéré, ou NULL si le tarif n'est pas renseigné.
--
-- La distance est celle de PostGIS : à VOL D'OISEAU. Une course réelle est plus
-- longue — détours, sens uniques, la Corniche. Le tarif au kilomètre doit être
-- calibré en conséquence, sinon la suggestion est systématiquement basse.
--
-- Le résultat est ramené au pas de 100 F et borné : une suggestion hors bornes
-- serait refusée par `create_ride_request()` juste après.
create function public.prix_suggere(
  p_service public.service_course,
  p_depart_lat double precision,
  p_depart_lon double precision,
  p_destination_lat double precision,
  p_destination_lon double precision
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when b.prix_base_xof is null or b.prix_km_xof is null then null
    else greatest(
      b.min_xof,
      least(
        b.max_xof,
        (round(
          (b.prix_base_xof + b.prix_km_xof * (
            extensions.st_distance(
              extensions.st_setsrid(
                extensions.st_makepoint(p_depart_lon, p_depart_lat), 4326)::extensions.geography,
              extensions.st_setsrid(
                extensions.st_makepoint(p_destination_lon, p_destination_lat), 4326)::extensions.geography
            ) / 1000.0
          )) / 100.0
        ) * 100)::integer
      )
    )
  end
  from public.bornes_prix b
  where b.service = p_service;
$$;

revoke all on function public.prix_suggere(
  public.service_course, double precision, double precision,
  double precision, double precision) from public, anon;
grant execute on function public.prix_suggere(
  public.service_course, double precision, double precision,
  double precision, double precision) to authenticated;
