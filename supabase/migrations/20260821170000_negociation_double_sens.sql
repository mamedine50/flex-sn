-- Flex — la négociation va dans les DEUX sens, et elle a une fin.
--
-- ================================================================ LE MODÈLE
-- Une négociation est un FIL entre une demande et un conducteur. Chaque message
-- du fil est une ligne d'`offers` : le prix proposé, par qui, à quel tour.
--
--   tour 1  le conducteur répond           (accepte le prix, ou en propose un autre)
--   tour 2  le passager contre-propose     ← premier aller-retour
--   tour 3  le conducteur contre-propose
--   tour 4  le passager contre-propose     ← second aller-retour
--   puis    accepter ou refuser, rien d'autre
--
-- DEUX ALLERS-RETOURS, ET C'EST TOUT. La limite n'est pas une prudence
-- technique : un marchandage sans fin fait perdre la course aux deux. Le
-- passager attend, le conducteur ne roule pas, et la demande expire pendant
-- qu'on discute. Quatre messages suffisent à se mettre d'accord ou à constater
-- qu'on n'y arrivera pas.
--
-- UNE SEULE OFFRE VIVANTE PAR FIL. L'index unique existant
-- (`demande_id`, `conducteur_id`) filtré sur `en_attente` le garantissait déjà.
-- Contre-proposer rend donc l'offre précédente caduque AVANT d'écrire la
-- nouvelle : à tout instant, une seule des deux parties a la balle.

create type public.auteur_offre as enum ('conducteur', 'passager');

alter table public.offers
  add column auteur public.auteur_offre not null default 'conducteur',
  add column tour smallint not null default 1;

alter table public.offers
  add constraint offers_tour_borne check (tour between 1 and 4);

comment on column public.offers.auteur is
  'Qui a écrit CE message du fil. Le conducteur ouvre toujours ; le passager ne peut que répondre.';
comment on column public.offers.tour is
  'Rang dans le fil, de 1 à 4. Au tour 4, il ne reste qu''accepter ou refuser — voir contre_proposer().';

-- ============================================================ contre-proposer
-- UNE SEULE FONCTION POUR LES DEUX CÔTÉS. Deux fonctions symétriques auraient
-- divergé au premier correctif : la limite de tours aurait été corrigée dans
-- l'une et pas dans l'autre, et le marchandage sans fin serait revenu par le
-- côté oublié.
create function public.contre_proposer(
  p_offre_id uuid,
  p_prix_xof integer,
  p_delai_arrivee_min smallint default null
)
returns public.offers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_offre public.offers;
  v_demande public.ride_requests;
  v_auteur public.auteur_offre;
  v_nouvelle public.offers;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select * into v_offre from public.offers where id = p_offre_id for update;
  if v_offre.id is null then
    raise exception 'offre_introuvable' using errcode = 'P0001';
  end if;

  select * into v_demande
  from public.ride_requests where id = v_offre.demande_id for update;

  -- QUI PARLE. On ne le demande pas à l'appelant : on le déduit. Un client qui
  -- annoncerait son camp pourrait annoncer l'autre.
  if v_demande.passager_id = v_uid then
    v_auteur := 'passager';
  elsif v_offre.conducteur_id = v_uid then
    v_auteur := 'conducteur';
  else
    raise exception 'negociation_etrangere'
      using errcode = 'P0001',
            detail = 'Ce fil ne vous concerne pas.';
  end if;

  -- ON NE SE RÉPOND PAS À SOI-MÊME. Sans ce test, un côté pourrait empiler ses
  -- propres offres et épuiser les quatre tours tout seul.
  if v_offre.auteur = v_auteur then
    raise exception 'pas_votre_tour'
      using errcode = 'P0001',
            detail = 'La balle est dans le camp d''en face.';
  end if;

  if v_offre.statut <> 'en_attente' then
    raise exception 'offre_indisponible'
      using errcode = 'P0001', detail = format('Statut : %s.', v_offre.statut);
  end if;

  if v_offre.expires_at <= now() or v_demande.expires_at <= now() then
    raise exception 'offre_expiree' using errcode = 'P0001';
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_verrouillee' using errcode = 'P0001';
  end if;

  -- LA LIMITE. Au quatrième message, on ne discute plus.
  if v_offre.tour >= 4 then
    raise exception 'negociation_epuisee'
      using errcode = 'P0001',
            detail = 'Deux allers-retours au maximum : acceptez ou refusez.';
  end if;

  -- Le prix reste dans les bornes du service, comme partout ailleurs.
  if not exists (
    select 1 from public.bornes_prix b
    where b.service = v_demande.service
      and p_prix_xof between b.min_xof and b.max_xof
  ) then
    raise exception 'prix_hors_bornes' using errcode = 'P0001';
  end if;

  update public.offers set statut = 'caduque' where id = v_offre.id;

  insert into public.offers (
    demande_id, conducteur_id, vehicule_id, type, prix_xof,
    delai_arrivee_min, expires_at, auteur, tour
  ) values (
    v_offre.demande_id, v_offre.conducteur_id, v_offre.vehicule_id,
    'contre_offre', p_prix_xof,
    coalesce(p_delai_arrivee_min, v_offre.delai_arrivee_min),
    v_demande.expires_at, v_auteur, v_offre.tour + 1
  )
  returning * into v_nouvelle;

  return v_nouvelle;
end;
$$;

revoke all on function public.contre_proposer(uuid, integer, smallint)
  from public, anon, authenticated;
grant execute on function public.contre_proposer(uuid, integer, smallint)
  to authenticated;

-- ================================================= accepter, des deux côtés
-- La seule chose qui change : QUI a le droit d'accepter. Une offre écrite par le
-- conducteur s'accepte par le passager ; une contre-proposition du passager
-- s'accepte par le conducteur. Tout le reste — verrous, expiration,
-- indisponibilité, cascade sur les autres offres — est repris à l'identique,
-- parce que c'est ce qui empêche deux passagers de verrouiller le même
-- conducteur.
create or replace function public.accept_offer(p_offre_id uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conducteur_id uuid;
  v_offre public.offers;
  v_demande public.ride_requests;
  v_course public.rides;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select conducteur_id into v_conducteur_id from public.offers where id = p_offre_id;

  if v_conducteur_id is null then
    raise exception 'offre_introuvable' using errcode = 'P0001';
  end if;

  perform 1 from public.profiles where id = v_conducteur_id for update;

  select * into v_offre from public.offers where id = p_offre_id for update;

  if v_offre.statut <> 'en_attente' then
    raise exception 'offre_indisponible'
      using errcode = 'P0001', detail = format('Statut : %s.', v_offre.statut);
  end if;

  if v_offre.expires_at <= now() then
    raise exception 'offre_expiree' using errcode = 'P0001';
  end if;

  select * into v_demande
  from public.ride_requests where id = v_offre.demande_id for update;

  -- On accepte ce que l'AUTRE a proposé, jamais ce qu'on a proposé soi-même.
  if v_offre.auteur = 'conducteur' then
    if v_demande.passager_id <> v_uid then
      raise exception 'demande_etrangere'
        using errcode = 'P0001',
              detail = 'Cette offre répond à la demande de quelqu''un d''autre.';
    end if;
  else
    if v_conducteur_id <> v_uid then
      raise exception 'demande_etrangere'
        using errcode = 'P0001',
              detail = 'Cette contre-proposition ne vous est pas adressée.';
    end if;
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_verrouillee' using errcode = 'P0001';
  end if;

  if v_demande.expires_at <= now() then
    raise exception 'demande_expiree' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.rides
    where conducteur_id = v_conducteur_id and statut in ('verrouillee', 'en_cours')
  ) then
    raise exception 'conducteur_indisponible'
      using errcode = 'P0001',
            detail = 'Ce conducteur vient de prendre une autre course.';
  end if;

  insert into public.rides (
    demande_id, offre_id, passager_id, conducteur_id, vehicule_id, prix_convenu_xof
  ) values (
    v_demande.id, v_offre.id, v_demande.passager_id, v_conducteur_id,
    v_offre.vehicule_id, v_offre.prix_xof
  )
  returning * into v_course;

  update public.ride_requests
  set statut = 'verrouillee', verrouillee_le = now()
  where id = v_demande.id;

  update public.offers set statut = 'acceptee' where id = v_offre.id;

  update public.offers
  set statut = 'caduque'
  where demande_id = v_demande.id
    and id <> v_offre.id
    and statut = 'en_attente';

  update public.events_prix
  set prix_convenu_xof = v_offre.prix_xof
  where demande_id = v_demande.id;

  return v_course;
end;
$$;

revoke all on function public.accept_offer(uuid) from public, anon, authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;
