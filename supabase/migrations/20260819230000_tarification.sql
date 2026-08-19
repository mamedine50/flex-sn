-- Flex — la tarification recommandée.
--
-- La recommandation est un MINIMUM, pas un milieu. Le passager peut la proposer
-- telle quelle ou la dépasser ; il ne peut pas descendre sous les bornes dures
-- de `bornes_prix`. La recommandation est une aide, la borne est une loi.
--
-- Pas de tarification dynamique. Aucun multiplicateur d'heure, de météo ou de
-- demande : dans ce modèle, la pointe se règle par la NÉGOCIATION — les
-- conducteurs contre-proposent plus haut quand ça bouchonne. Un coefficient
-- horaire ne sera envisagé que mesuré sur nos propres données, jamais deviné.

alter table public.bornes_prix
  add column facteur_detour numeric(3, 2) not null default 1.3
    check (facteur_detour >= 1 and facteur_detour <= 3);

comment on column public.bornes_prix.facteur_detour is
  'Un trajet routier à Dakar vaut ~1,3× la distance à vol d''oiseau ; st_distance est à vol d''oiseau, ce facteur l''absorbe.';

comment on column public.bornes_prix.prix_km_xof is
  'Part kilométrique AVANT facteur de détour. Le tarif effectif par kilomètre à vol d''oiseau vaut prix_km_xof × facteur_detour — soit 150 × 1,3 = 195 F/km en urbain.';

-- ------------------------------------------------------------ prix_suggere --
-- Même signature, même type de retour : `create or replace` suffit et les droits
-- déjà accordés survivent.
create or replace function public.prix_suggere(
  p_service public.service_course,
  p_depart_lat double precision,
  p_depart_lon double precision,
  p_destination_lat double precision,
  p_destination_lon double precision
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bornes public.bornes_prix;
  v_metres double precision;
  v_brut numeric;
begin
  -- L'INTERURBAIN NE SE CALCULE PAS AU KILOMÈTRE.
  --
  -- Un Dakar–Touba a un prix d'usage, celui d'une place de sept-places, et la
  -- formule urbaine tombe en dessous. Servir ce chiffre-là ferait proposer un
  -- prix qu'aucun conducteur n'accepte, et le passager n'aurait aucune réponse
  -- sans comprendre pourquoi. Une recommandation fausse est pire qu'un champ
  -- vide : on rend NULL, l'écran s'ouvre vide et exige une saisie.
  --
  -- Le pricing interurbain — corridors à prix d'usage — est reporté à après la
  -- V1. Les journaux `events_prix` couvrent DÉJÀ les deux services : ce sont eux
  -- qui donneront les prix d'usage réels le jour où on s'y mettra.
  if p_service = 'interurbain' then
    return null;
  end if;

  select * into v_bornes from public.bornes_prix where service = p_service;
  if v_bornes.service is null
     or v_bornes.prix_base_xof is null
     or v_bornes.prix_km_xof is null then
    return null;
  end if;

  v_metres := extensions.st_distance(
    extensions.st_setsrid(
      extensions.st_makepoint(p_depart_lon, p_depart_lat), 4326)::extensions.geography,
    extensions.st_setsrid(
      extensions.st_makepoint(p_destination_lon, p_destination_lat),
      4326)::extensions.geography);

  v_brut := v_bornes.prix_base_xof
          + (v_metres / 1000.0) * v_bornes.facteur_detour * v_bornes.prix_km_xof;

  return greatest(v_bornes.min_xof,
                  least(v_bornes.max_xof, (round(v_brut / 100.0) * 100)::integer));
end;
$$;

comment on function public.prix_suggere(
  public.service_course, double precision, double precision,
  double precision, double precision) is
  'Prix recommandé MINIMUM. Urbain : base + distance × facteur_detour × prix_km. Interurbain : NULL — le prix y est un usage, pas un calcul ; reporté à après la V1.';
