-- Flex — ce que le passager voit arriver, et comment il refuse.
--
-- Deux manques révélés par l'écran « Offres reçues » : rien ne joignait une offre
-- au conducteur qui la fait (le client aurait dû faire trois requêtes et
-- recomposer lui-même), et rien ne permettait de REFUSER — le statut existait,
-- la porte pour y aller n'existait pas.

-- Ce qu'un passager voit d'une offre AVANT d'accepter : prénom, note, modèle,
-- couleur. Ni numéro, ni plaque — la même règle que partout ailleurs, et c'est
-- la projection de colonnes qui la tient, pas la RLS.
create view public.offres_recues
with (security_invoker = false) as
select
  o.id,
  o.demande_id,
  o.type,
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
  v.couleur as vehicule_couleur
from public.offers o
join public.ride_requests d on d.id = o.demande_id
join public.profiles p on p.id = o.conducteur_id
join public.vehicles v on v.id = o.vehicule_id
-- Seulement les offres qui répondent à MES demandes.
where d.passager_id = (select auth.uid());

comment on view public.offres_recues is
  'Offres reçues par le passager. Ni téléphone ni plaque : ils arrivent avec la course, par les tables.';

revoke all on public.offres_recues from anon, authenticated;
grant select on public.offres_recues to authenticated;

-- Refuser une offre. Le passager reste maître de sa demande : refuser ne la
-- ferme pas, elle continue de recevoir des réponses jusqu'à son échéance.
create function public.refuse_offer(p_offre_id uuid)
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

  if v_passager <> v_uid then
    raise exception 'demande_etrangere' using errcode = 'P0001';
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
