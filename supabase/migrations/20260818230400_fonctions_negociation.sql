-- Flex — la négociation.
--
-- Toute la logique métier est ici, en fonctions appelées en RPC. Les tables ne
-- reçoivent aucun droit d'écriture : c'est la seule porte.
--
-- Les erreurs portent un message court et stable (`prix_hors_bornes`,
-- `demande_expiree`, …). Le client le traduit par `src/i18n`. Le `detail` porte
-- la phrase française pour les journaux, pas pour l'écran.

-- ------------------------------------------------------ create_ride_request --
create function public.create_ride_request(
  p_service public.service_course,
  p_depart_lat double precision,
  p_depart_lon double precision,
  p_depart_libelle text,
  p_destination_lat double precision,
  p_destination_lon double precision,
  p_destination_libelle text,
  p_prix_xof integer
)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_bornes public.bornes_prix;
  v_demande public.ride_requests;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profil_absent' using errcode = 'P0001';
  end if;

  if p_prix_xof % 100 <> 0 then
    raise exception 'prix_non_multiple_de_100'
      using errcode = 'P0001',
            detail = 'Le pas de prix est de 100 FCFA.';
  end if;

  select * into v_bornes from public.bornes_prix where service = p_service;

  if p_prix_xof < v_bornes.min_xof or p_prix_xof > v_bornes.max_xof then
    raise exception 'prix_hors_bornes'
      using errcode = 'P0001',
            detail = format('Attendu entre %s et %s XOF, reçu %s.',
                            v_bornes.min_xof, v_bornes.max_xof, p_prix_xof);
  end if;

  -- Une seule demande ouverte à la fois. L'index unique le tiendrait, mais il
  -- rendrait une 23505 illisible pour le client.
  if exists (
    select 1 from public.ride_requests
    where passager_id = v_uid and statut = 'ouverte'
  ) then
    raise exception 'demande_deja_ouverte' using errcode = 'P0001';
  end if;

  insert into public.ride_requests (
    passager_id, service,
    depart_lat, depart_lon, depart_libelle,
    destination_lat, destination_lon, destination_libelle,
    prix_xof, expires_at
  ) values (
    v_uid, p_service,
    p_depart_lat, p_depart_lon, btrim(p_depart_libelle),
    p_destination_lat, p_destination_lon, btrim(p_destination_libelle),
    p_prix_xof, now() + public.duree_demande(p_service)
  )
  returning * into v_demande;

  return v_demande;
end;
$$;

-- ------------------------------------------------------------ submit_offer --
create function public.submit_offer(
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

  if not exists (
    select 1 from public.profiles where id = v_uid and role = 'conducteur'
  ) then
    raise exception 'role_invalide'
      using errcode = 'P0001', detail = 'Seul un conducteur soumet une offre.';
  end if;

  select * into v_vehicule
  from public.vehicles where conducteur_id = v_uid and actif;

  if v_vehicule.id is null then
    raise exception 'vehicule_absent' using errcode = 'P0001';
  end if;

  -- `for share` : la demande ne peut pas être verrouillée par une acceptation
  -- pendant qu'on insère l'offre. Le verrou exclusif d'`accept_offer()` attend.
  select * into v_demande
  from public.ride_requests where id = p_demande_id for share;

  if v_demande.id is null then
    raise exception 'demande_introuvable' using errcode = 'P0001';
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_verrouillee' using errcode = 'P0001';
  end if;

  if v_demande.expires_at <= now() then
    raise exception 'demande_expiree' using errcode = 'P0001';
  end if;

  -- Un conducteur déjà en course ne peut pas en promettre une autre.
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
    -- Une offre ne survit jamais à sa demande.
    least(now() + public.duree_offre(v_demande.service), v_demande.expires_at)
  )
  returning * into v_offre;

  return v_offre;
end;
$$;

-- ------------------------------------------------------------ accept_offer --
-- Le point critique de Flex : deux passagers peuvent accepter, à la même
-- seconde, deux offres du MÊME conducteur. Un seul doit passer.
--
-- Ordre de verrouillage, toujours le même — c'est ce qui évite l'interblocage :
--   1. la ligne du conducteur   (sérialise les acceptations concurrentes)
--   2. la ligne de la demande   (interdit une offre tardive)
--   3. la ligne de l'offre
--
-- La première transaction prend le verrou sur le conducteur et le garde jusqu'au
-- commit. La seconde attend là. Quand elle repart, la course existe : elle
-- relit, la voit, et refuse. L'index unique partiel sur `rides` est la garde de
-- dernier recours si cette logique se troue un jour.
create function public.accept_offer(p_offre_id uuid)
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

  -- Lecture sans verrou, seulement pour savoir QUI verrouiller ensuite.
  select conducteur_id into v_conducteur_id from public.offers where id = p_offre_id;

  if v_conducteur_id is null then
    raise exception 'offre_introuvable' using errcode = 'P0001';
  end if;

  -- 1. Le conducteur. Tout le reste de la fonction est sérialisé par ce verrou.
  perform 1 from public.profiles where id = v_conducteur_id for update;

  -- 2. L'offre, relue sous verrou : entre la lecture ci-dessus et maintenant,
  --    elle a pu devenir caduque.
  select * into v_offre from public.offers where id = p_offre_id for update;

  if v_offre.statut <> 'en_attente' then
    raise exception 'offre_indisponible'
      using errcode = 'P0001', detail = format('Statut : %s.', v_offre.statut);
  end if;

  if v_offre.expires_at <= now() then
    raise exception 'offre_expiree' using errcode = 'P0001';
  end if;

  -- 3. La demande.
  select * into v_demande
  from public.ride_requests where id = v_offre.demande_id for update;

  if v_demande.passager_id <> v_uid then
    raise exception 'demande_etrangere'
      using errcode = 'P0001', detail = 'Cette offre répond à la demande de quelqu''un d''autre.';
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_verrouillee' using errcode = 'P0001';
  end if;

  if v_demande.expires_at <= now() then
    raise exception 'demande_expiree' using errcode = 'P0001';
  end if;

  -- Le verrou est tenu : si une autre acceptation est passée avant, sa course
  -- est visible ici, et seulement ici.
  if exists (
    select 1 from public.rides
    where conducteur_id = v_conducteur_id and statut in ('verrouillee', 'en_cours')
  ) then
    raise exception 'conducteur_indisponible'
      using errcode = 'P0001', detail = 'Ce conducteur vient de prendre une autre course.';
  end if;

  insert into public.rides (
    demande_id, offre_id, passager_id, conducteur_id, vehicule_id, prix_convenu_xof
  ) values (
    v_demande.id, v_offre.id, v_uid, v_conducteur_id, v_offre.vehicule_id, v_offre.prix_xof
  )
  returning * into v_course;

  update public.ride_requests
  set statut = 'verrouillee', verrouillee_le = now()
  where id = v_demande.id;

  update public.offers set statut = 'acceptee' where id = v_offre.id;

  -- Les autres offres tombent : la demande est prise.
  update public.offers
  set statut = 'caduque'
  where demande_id = v_demande.id
    and id <> v_offre.id
    and statut = 'en_attente';

  return v_course;
end;
$$;

-- ------------------------------------------------------------ expire_stale --
-- Passe les demandes et les offres échues. Appelée par une tâche planifiée,
-- jamais par un client : elle n'est pas accordée à `authenticated`.
create function public.expire_stale()
returns table (demandes_expirees integer, offres_expirees integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_demandes integer;
  v_offres integer;
begin
  with echues as (
    update public.ride_requests
    set statut = 'expiree'
    where statut = 'ouverte' and expires_at <= now()
    returning 1
  )
  select count(*)::integer into v_demandes from echues;

  with echues as (
    update public.offers o
    set statut = 'expiree'
    where o.statut = 'en_attente'
      and (
        o.expires_at <= now()
        -- Une offre dont la demande n'est plus ouverte n'a plus d'objet, même
        -- si sa propre échéance n'est pas atteinte.
        or exists (
          select 1 from public.ride_requests d
          where d.id = o.demande_id and d.statut in ('expiree', 'annulee')
        )
      )
    returning 1
  )
  select count(*)::integer into v_offres from echues;

  return query select v_demandes, v_offres;
end;
$$;

-- ------------------------------------------------------------------ droits --
-- `revoke from public` ne suffit pas : Supabase pose des droits par défaut qui
-- accordent `execute` à anon et authenticated sur toute fonction créée dans
-- `public`. Il faut donc leur retirer nommément, puis rendre explicitement.
revoke all on function public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer) from public;
revoke all on function public.submit_offer(
  uuid, public.type_offre, integer, smallint) from public;
revoke all on function public.accept_offer(uuid) from public;
revoke all on function public.expire_stale() from public;

revoke all on function public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer) from anon, authenticated;
revoke all on function public.submit_offer(
  uuid, public.type_offre, integer, smallint) from anon, authenticated;
revoke all on function public.accept_offer(uuid) from anon, authenticated;
revoke all on function public.expire_stale() from anon, authenticated;

grant execute on function public.create_ride_request(
  public.service_course, double precision, double precision, text,
  double precision, double precision, text, integer) to authenticated;
grant execute on function public.submit_offer(
  uuid, public.type_offre, integer, smallint) to authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;

-- `expire_stale()` n'est PAS accordée à authenticated. Tâche planifiée seule.
grant execute on function public.expire_stale() to service_role;
