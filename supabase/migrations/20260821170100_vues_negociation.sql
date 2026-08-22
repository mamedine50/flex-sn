-- Flex — ce que chaque côté voit du fil, et le refus des deux côtés.

-- ===================================================== ce que le passager voit
-- Trois colonnes de plus, pas une de moins : `auteur` et `tour` disent à l'écran
-- s'il reste une contre-proposition possible ; `vehicule_photo` montre la
-- voiture qui viendra. La photo n'est servie que VALIDÉE — même règle que
-- `vehicules_publics`, pour la même raison : personne ne regarde une image que
-- l'équipe n'a pas vue.
--
-- Changer le type de retour d'une vue = drop + create = re-grant obligatoire.
drop view if exists public.offres_recues;

create view public.offres_recues
with (security_invoker = false) as
  select
    o.id,
    o.demande_id,
    o.type,
    o.auteur,
    o.tour,
    o.prix_xof,
    o.delai_arrivee_min,
    o.statut,
    o.expires_at,
    o.cree_le,
    o.conducteur_id,
    p.prenom as conducteur_prenom,
    p.photo_url as conducteur_photo,
    p.note_moyenne as conducteur_note,
    p.nb_notes as conducteur_nb_notes,
    v.modele as vehicule_modele,
    v.couleur as vehicule_couleur,
    (select d2.chemin
       from public.documents_conducteur d2
      where d2.profil_id = o.conducteur_id
        and d2.type = 'photo_vehicule'
        and d2.statut = 'valide') as vehicule_photo,
    public.est_nouveau_conducteur(p.id) as conducteur_est_nouveau,
    public.courses_comme_conducteur(p.id) as conducteur_nb_courses
  from public.offers o
  join public.ride_requests d on d.id = o.demande_id
  join public.profiles p on p.id = o.conducteur_id
  join public.vehicles v on v.id = o.vehicule_id
  where d.passager_id = (select auth.uid())
    and not public.est_bloque((select auth.uid()), o.conducteur_id);

revoke all on public.offres_recues from public, anon, authenticated;
grant select on public.offres_recues to authenticated;

-- =================================================== ce que le conducteur voit
-- SANS CETTE VUE, LA CONTRE-PROPOSITION DU PASSAGER TOMBE DANS LE VIDE. La file
-- du conducteur ne montre que les demandes OUVERTES ; un fil où le passager
-- vient de répondre n'y apparaît plus comme une nouveauté. Il lui faut donc une
-- liste à lui : « on vous a répondu ».
--
-- La confidentialité ne bouge pas d'un pouce : commune de départ, direction,
-- prénom et note du passager. Ni son nom, ni son numéro, ni sa position exacte —
-- la demande n'est pas encore acceptée.
create view public.negociations_conducteur
with (security_invoker = false) as
  select
    o.id,
    o.demande_id,
    o.prix_xof,
    o.delai_arrivee_min,
    o.tour,
    o.expires_at,
    o.cree_le,
    d.service,
    d.prix_xof as prix_demande_xof,
    public.arrondir_zone(d.depart_lat) as zone_depart_lat,
    public.arrondir_zone(d.depart_lon) as zone_depart_lon,
    d.destination_libelle,
    p.prenom as passager_prenom,
    p.photo_url as passager_photo,
    p.note_moyenne as passager_note
  from public.offers o
  join public.ride_requests d on d.id = o.demande_id
  join public.profiles p on p.id = d.passager_id
  where o.conducteur_id = (select auth.uid())
    and o.auteur = 'passager'
    and o.statut = 'en_attente'
    and d.statut = 'ouverte'
    and o.expires_at > now()
    and not public.est_bloque((select auth.uid()), d.passager_id)
  order by o.cree_le desc;

revoke all on public.negociations_conducteur from public, anon, authenticated;
grant select on public.negociations_conducteur to authenticated;

comment on view public.negociations_conducteur is
  'Les contre-propositions que le PASSAGER a envoyées au conducteur. Le libellé exact du départ n''y est pas — seulement la maille — parce que la course n''est pas acceptée.';

-- ============================================== refuser, des deux côtés aussi
-- Même correction que pour `accept_offer`, et pour la même raison : sans elle,
-- une contre-proposition du passager ne pourrait ni être acceptée ni être
-- refusée par le conducteur. Elle resterait à attendre l'expiration, en
-- bloquant le fil.
create or replace function public.refuse_offer(p_offre_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_offre public.offers;
  v_passager uuid;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select * into v_offre from public.offers where id = p_offre_id for update;

  if v_offre.id is null then
    raise exception 'offre_introuvable' using errcode = 'P0001';
  end if;

  select passager_id into v_passager
  from public.ride_requests where id = v_offre.demande_id;

  -- On refuse ce que l'AUTRE a proposé.
  if v_offre.auteur = 'conducteur' then
    if v_passager <> v_uid then
      raise exception 'demande_etrangere' using errcode = 'P0001';
    end if;
  else
    if v_offre.conducteur_id <> v_uid then
      raise exception 'demande_etrangere' using errcode = 'P0001';
    end if;
  end if;

  -- Une offre déjà acceptée, caduque ou expirée ne se refuse pas : le refus
  -- écraserait un état qui porte de l'information.
  if v_offre.statut <> 'en_attente' then
    raise exception 'offre_indisponible'
      using errcode = 'P0001', detail = format('Statut : %s.', v_offre.statut);
  end if;

  update public.offers set statut = 'refusee' where id = p_offre_id
  returning * into v_offre;

  return v_offre;
end;
$$;

revoke all on function public.refuse_offer(uuid) from public, anon, authenticated;
grant execute on function public.refuse_offer(uuid) to authenticated;
