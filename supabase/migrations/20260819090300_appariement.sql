-- Flex — appariement par proximité, et nom de commune dans la file.

-- La file gagne deux colonnes et change de test de rôle. `create or replace` :
-- les colonnes existantes gardent leur nom, leur type et leur ordre, les
-- nouvelles s'ajoutent à la fin — les droits déjà accordés survivent.
create or replace view public.demandes_ouvertes
with (security_invoker = false) as
select
  d.id,
  d.service,
  d.prix_xof,
  d.expires_at,
  d.cree_le,
  public.arrondir_zone(d.depart_lat) as zone_depart_lat,
  public.arrondir_zone(d.depart_lon) as zone_depart_lon,
  d.destination_libelle,
  public.arrondir_zone(d.destination_lat) as zone_destination_lat,
  public.arrondir_zone(d.destination_lon) as zone_destination_lon,
  d.passager_id,
  p.prenom as passager_prenom,
  p.note_moyenne as passager_note,
  -- La commune est calculée depuis la MAILLE, pas depuis le point exact : on ne
  -- sert jamais deux précisions différentes du même lieu. À l'échelle d'une
  -- commune, 550 m ne changent rien.
  public.commune_la_plus_proche(
    public.arrondir_zone(d.depart_lat), public.arrondir_zone(d.depart_lon)
  ) as depart_commune,
  public.commune_la_plus_proche(
    d.destination_lat, d.destination_lon
  ) as destination_commune
from public.ride_requests d
join public.profiles p on p.id = d.passager_id
where d.statut = 'ouverte'
  and d.expires_at > now()
  -- Conduire est une capacité, plus un type de compte.
  and public.est_conducteur((select auth.uid()))
  -- Et on ne se propose pas sa propre course : depuis que le même compte peut
  -- commander et conduire, un conducteur voyait sa demande dans sa file.
  -- `submit_offer()` la refuse déjà ; ne pas la montrer évite d'y aller.
  and d.passager_id <> (select auth.uid());

-- Les demandes à portée du conducteur connecté.
--
-- `returns setof public.demandes_ouvertes` : une seule définition des colonnes
-- servies. Ajouter une colonne à la vue l'ajoute ici, et surtout, RETIRER une
-- colonne confidentielle de la vue la retire ici aussi. Deux projections
-- séparées finiraient par diverger, et c'est la seconde qui fuirait.
create function public.demandes_proches(p_rayon_m integer default 3000)
returns setof public.demandes_ouvertes
language sql
stable
security definer
set search_path = ''
as $$
  select f.*
  from public.demandes_ouvertes f
  join public.ride_requests d on d.id = f.id
  -- `en_ligne` : un conducteur hors ligne ne prend pas de course, il n'a donc
  -- pas à voir la file. C'est aussi la condition de l'index partiel qui servira
  -- à la requête inverse — diffuser une demande aux conducteurs à proximité.
  join public.positions_conducteurs pc
    on pc.conducteur_id = (select auth.uid()) and pc.en_ligne
  -- Sur la MAILLE, jamais sur le point exact : un rayon choisi par l'appelant
  -- et une réponse oui/non permettent de trianguler. Trois essais suffisent.
  where extensions.st_dwithin(d.zone_depart_geo, pc.geo, p_rayon_m)
  order by extensions.st_distance(d.zone_depart_geo, pc.geo);
$$;

revoke all on function public.demandes_proches(integer) from public, anon;
grant execute on function public.demandes_proches(integer) to authenticated;

comment on function public.demandes_proches(integer) is
  'File des demandes à portée. Filtre sur zone_depart_geo (la maille) — jamais sur depart_geo, qui permettrait une trilatération.';
