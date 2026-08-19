-- Flex — vues publiques.
--
-- RLS filtre des LIGNES, pas des COLONNES. Or la confidentialité de Flex est
-- une affaire de colonnes : un conducteur a le droit de voir qu'une demande
-- existe, pas de savoir qui la pose.
--
-- Ces vues sont donc en `security_invoker = false` : elles s'exécutent avec les
-- droits de leur propriétaire et contournent la RLS de la table sous-jacente,
-- mais ne projettent que les colonnes non confidentielles. C'est le seul
-- endroit du schéma où la RLS est contournée, et c'est délibéré.

-- ------------------------------------------------------------ profils vus --
-- Prénom, photo, note. Ni nom complet, ni téléphone. Jamais.
create view public.profils_publics
with (security_invoker = false) as
select
  p.id,
  p.prenom,
  p.photo_url,
  p.note_moyenne,
  p.nb_notes,
  p.role
from public.profiles p;

comment on view public.profils_publics is
  'Projection non confidentielle de profiles. N''y ajouter ni nom_complet ni telephone.';

-- ---------------------------------------------------------- véhicules vus --
-- Modèle et couleur suffisent à choisir une offre. La plaque sert à monter
-- dans la bonne voiture : elle arrive avec la course, par la table `vehicles`.
create view public.vehicules_publics
with (security_invoker = false) as
select
  v.id,
  v.conducteur_id,
  v.modele,
  v.couleur
from public.vehicles v
where v.actif;

comment on view public.vehicules_publics is
  'Projection non confidentielle de vehicles. N''y ajouter pas la plaque.';

-- --------------------------------------------------------- demandes vues --
-- Ce qu'un conducteur voit AVANT d'accepter : la maille, pas le point ; le
-- prénom, pas le nom ; aucun numéro. Le libellé du départ est exclu — c'est
-- souvent une adresse. Celui de la destination reste, il dit où l'on va, pas
-- où se tient quelqu'un.
create view public.demandes_ouvertes
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
  p.note_moyenne as passager_note
from public.ride_requests d
join public.profiles p on p.id = d.passager_id
where d.statut = 'ouverte'
  and d.expires_at > now()
  -- Réservée aux conducteurs : un passager n'a rien à faire dans la file.
  and exists (
    select 1
    from public.profiles c
    where c.id = (select auth.uid())
      and c.role = 'conducteur'
  );

comment on view public.demandes_ouvertes is
  'File des demandes pour un conducteur, avant acceptation. Positions arrondies par arrondir_zone(), aucune donnée confidentielle du passager.';

revoke all on public.profils_publics from anon, authenticated;
revoke all on public.vehicules_publics from anon, authenticated;
revoke all on public.demandes_ouvertes from anon, authenticated;

grant select on public.profils_publics to authenticated;
grant select on public.vehicules_publics to authenticated;
grant select on public.demandes_ouvertes to authenticated;
