-- Flex — conduire est une capacité, pas un type de compte.
--
-- La raison est sociale, pas technique. Avec un rôle exclusif, un conducteur qui
-- rentre chez soi et veut commander une course ouvre un DEUXIÈME compte. Et un
-- deuxième compte casse tout ce sur quoi la confiance repose : la note,
-- l'historique, le blocage réciproque. Le blocage surtout — bloquer quelqu'un ne
-- sert à rien s'il revient sous un autre nom.
--
-- Donc : tout le monde est passager. Être conducteur s'acquiert.
--
-- Migration additive : la colonne `role` reste en place le temps de la bascule.
-- Elle n'est plus consultée par aucune fonction ni aucune vue à partir d'ici.

alter table public.profiles
  add column documents_valides_le timestamptz;

comment on column public.profiles.documents_valides_le is
  'Date de validation des documents conducteur. NULL = pas encore conducteur. Voir est_conducteur().';

comment on column public.profiles.role is
  'OBSOLÈTE depuis 20260819090100. Conservé le temps de la bascule. La capacité à conduire se lit par est_conducteur().';

-- Vrai quand le profil a des documents validés ET un véhicule actif. Les deux :
-- des papiers sans voiture ne conduisent personne, une voiture sans papiers non
-- plus.
create function public.est_conducteur(p_profil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.vehicles v on v.conducteur_id = p.id and v.actif
    where p.id = p_profil
      and p.documents_valides_le is not null
  );
$$;

revoke all on function public.est_conducteur(uuid) from public, anon;
grant execute on function public.est_conducteur(uuid) to authenticated;

-- `create or replace` : la signature et le type de retour ne bougent pas, donc
-- les droits déjà accordés survivent. Un changement de type de retour aurait
-- imposé drop + create + re-grant.
create or replace function public.submit_offer(
  p_demande_id uuid,
  p_type public.type_offre,
  p_prix_xof integer,
  p_delai_arrivee_min smallint
)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_demande public.ride_requests;
  v_vehicule public.vehicles;
  v_bornes public.bornes_prix;
  v_offre public.offers;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  -- Deux refus distincts plutôt qu'un seul : « vous n'êtes pas conducteur » ne
  -- dit pas quoi faire, « vos documents ne sont pas validés » si.
  if not exists (
    select 1 from public.profiles
    where id = v_uid and documents_valides_le is not null
  ) then
    raise exception 'documents_non_valides'
      using errcode = 'P0001',
            detail = 'Les documents conducteur ne sont pas encore validés.';
  end if;

  select * into v_vehicule
  from public.vehicles where conducteur_id = v_uid and actif;

  if v_vehicule.id is null then
    raise exception 'vehicule_absent' using errcode = 'P0001';
  end if;

  select * into v_demande
  from public.ride_requests where id = p_demande_id for share;

  if v_demande.id is null then
    raise exception 'demande_introuvable' using errcode = 'P0001';
  end if;

  -- On ne répond pas à sa propre demande.
  if v_demande.passager_id = v_uid then
    raise exception 'demande_a_soi' using errcode = 'P0001';
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_verrouillee' using errcode = 'P0001';
  end if;

  if v_demande.expires_at <= now() then
    raise exception 'demande_expiree' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.rides
    where conducteur_id = v_uid and statut in ('verrouillee', 'en_cours')
  ) then
    raise exception 'conducteur_indisponible' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.offers
    where demande_id = p_demande_id
      and conducteur_id = v_uid
      and statut = 'en_attente'
  ) then
    raise exception 'offre_deja_soumise' using errcode = 'P0001';
  end if;

  if p_prix_xof % 100 <> 0 then
    raise exception 'prix_non_multiple_de_100' using errcode = 'P0001';
  end if;

  if p_type = 'acceptation' and p_prix_xof <> v_demande.prix_xof then
    raise exception 'prix_incoherent'
      using errcode = 'P0001',
            detail = 'Une acceptation reprend le prix du passager. Sinon c''est une contre-offre.';
  end if;

  if p_type = 'contre_offre' then
    if p_prix_xof = v_demande.prix_xof then
      raise exception 'contre_offre_identique' using errcode = 'P0001';
    end if;

    select * into v_bornes from public.bornes_prix where service = v_demande.service;

    if p_prix_xof < v_bornes.min_xof or p_prix_xof > v_bornes.max_xof then
      raise exception 'prix_hors_bornes' using errcode = 'P0001';
    end if;
  end if;

  insert into public.offers (
    demande_id, conducteur_id, vehicule_id,
    type, prix_xof, delai_arrivee_min, expires_at
  ) values (
    p_demande_id, v_uid, v_vehicule.id,
    p_type, p_prix_xof, p_delai_arrivee_min,
    least(now() + public.duree_offre(v_demande.service), v_demande.expires_at)
  )
  returning * into v_offre;

  return v_offre;
end;
$$;

-- Un conducteur qui rentre chez lui commande une course avec le même compte :
-- `create_ride_request()` n'a jamais interrogé `role`, rien à changer. Un test
-- le prouve désormais, pour que personne ne « resserre » ça un jour.
