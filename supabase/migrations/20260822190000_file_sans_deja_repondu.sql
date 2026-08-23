-- Flex — une demande à laquelle on a déjà répondu quitte la file.
--
-- ================================================== LE CUL-DE-SAC
-- `demandes_proches()` servait toutes les demandes ouvertes à portée, y compris
-- celles où le conducteur avait DÉJÀ une offre en attente. Il la voyait donc
-- encore dans sa file, appuyait, et recevait « Vous avez déjà répondu à cette
-- demande » — un message juste, à un endroit où il ne mène nulle part.
--
-- Le pire est qu'il n'avait rien fait de mal : la carte lui proposait un geste
-- que le serveur allait refuser. Un bouton qui existe est une promesse.
--
-- ============================================ CE N'EST PAS UNE NOUVELLE RÈGLE
-- C'est la MÊME que `offre_deja_soumise`, écrite là où elle se voit. Une règle
-- que le serveur applique mais que l'écran ignore produit exactement ça : un
-- utilisateur qui se cogne à une porte qu'on lui a montrée ouverte.
--
-- Même condition, au mot près — `statut = 'en_attente'`. Une offre REFUSÉE ne
-- retire rien : le passager a dit non, la demande est encore ouverte, et le
-- conducteur a le droit de retenter tant qu'il reste des tours. Une offre
-- caduque ou expirée non plus.
--
-- ============================== ET LE FIL N'EST PAS PERDU POUR AUTANT
-- Quand le passager contre-propose, la demande ne revient pas dans la file :
-- elle apparaît dans `negociations_conducteur`, en TÊTE de l'écran. Ce qui est
-- adressé à quelqu'un passe devant ce qui est ouvert à tous.
create or replace function public.demandes_proches(p_rayon_m integer default 3000)
returns setof public.demandes_ouvertes
language sql
stable
security definer
set search_path = ''
as $$
  select f.*
  from public.demandes_ouvertes f
  join public.ride_requests d on d.id = f.id
  join public.positions_conducteurs pc
    on pc.conducteur_id = (select auth.uid()) and pc.en_ligne
  where extensions.st_dwithin(d.zone_depart_geo, pc.geo, p_rayon_m)
    -- Déjà répondu : la demande sort de la file. `submit_offer()` la refuserait
    -- de toute façon, et une carte qui propose un geste refusé est un piège.
    and not exists (
      select 1 from public.offers o
      where o.demande_id = d.id
        and o.conducteur_id = (select auth.uid())
        and o.statut = 'en_attente'
    )
  order by extensions.st_distance(d.zone_depart_geo, pc.geo);
$$;

comment on function public.demandes_proches(integer) is
  'File des demandes à portée. Filtre sur zone_depart_geo (la maille) — jamais sur depart_geo, qui permettrait une trilatération. Écarte celles où l''appelant a déjà une offre en attente : le fil se poursuit dans negociations_conducteur, pas ici.';
