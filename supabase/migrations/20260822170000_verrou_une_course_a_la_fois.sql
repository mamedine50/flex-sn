-- Flex — « une course à la fois » cessait de tenir dès que la course roulait.
--
-- ================================================== LE DÉFAUT
-- `submit_offer()` et `accept_offer()` refusaient un conducteur déjà pris en
-- testant `statut in ('verrouillee', 'en_cours')`. C'était la liste des statuts
-- du jour où ces fonctions ont été écrites. `20260820100000_statuts_course` a
-- ajouté `en_route`, `arrive` et `commencee` — et l'application ne pose plus
-- JAMAIS `en_cours`. Le test ne reconnaissait donc plus aucun des états par
-- lesquels une vraie course passe.
--
-- Un conducteur avec quelqu'un dans sa voiture pouvait s'engager sur une
-- seconde course.
--
-- ================================== POURQUOI RIEN N'A ÉTÉ CASSÉ POUR AUTANT
-- L'index unique partiel `rides_conducteur_actif_unique` porte, LUI, sur
-- `course_active(statut)` : la base refusait la seconde course par violation
-- d'unicité. Le verrou tenait donc, mais par le mauvais bout — l'appelant
-- recevait une 23505 brute au lieu de `conducteur_indisponible`, c'est-à-dire
-- un message que l'application ne sait pas traduire. Et le refus arrivait après
-- que la fonction ait commencé à verrouiller la demande et à faire tomber les
-- autres offres : tout est annulé par la transaction, mais on tenait le bon
-- résultat pour de mauvaises raisons.
--
-- ================================================== LA LEÇON, DÉJÀ APPRISE
-- C'est le même défaut que le compte de pièces figé à quatre : une liste
-- littérale devient fausse en silence quand l'énumération grandit. Les policies
-- RLS ont été migrées vers `course_active()` en son temps ; ces deux
-- fonctions-là ont été oubliées. La règle a UN nom, et c'est ce nom qu'on
-- appelle partout.
create or replace function public.conducteur_occupe(p_conducteur uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.conducteur_id = p_conducteur
      and public.course_active(r.statut)
  );
$$;

-- FERMÉE À TOUT LE MONDE. Elle n'est appelée que depuis `submit_offer` et
-- `accept_offer`, toutes deux SECURITY DEFINER : elles s'exécutent en tant que
-- propriétaire et n'ont besoin d'aucun droit. Ni vue ni policy ne l'appelle,
-- donc rien à ouvrir. Le client sait déjà s'il est occupé, il a sa course.
revoke all on function public.conducteur_occupe(uuid) from public, anon, authenticated;

comment on function public.conducteur_occupe(uuid) is
  'Une course à la fois. Nomme la règle au lieu de recopier une liste de statuts — c''est une liste recopiée qui l''avait rendue fausse en silence.';
create or replace function public.submit_offer(p_demande_id uuid, p_type type_offre, p_prix_xof integer, p_delai_arrivee_min smallint)
 RETURNS offers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 1 where public.conducteur_occupe(v_uid)
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

  -- Le journal : combien d'offres, combien de contre-offres, et au bout de
  -- combien de temps la PREMIÈRE est arrivée. Ce dernier chiffre dira si un prix
  -- est trop bas bien avant qu'on ne mesure un taux de réponse.
  update public.events_prix
  set nb_offres = nb_offres + 1,
      nb_contre_offres = nb_contre_offres
        + case when p_type = 'contre_offre' then 1 else 0 end,
      delai_premiere_offre_s = coalesce(
        delai_premiere_offre_s,
        greatest(0, round(extract(epoch from (now() - v_demande.cree_le)))::integer))
  where demande_id = p_demande_id;

  return v_offre;
end;
$function$;

create or replace function public.accept_offer(p_offre_id uuid)
 RETURNS rides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 1 where public.conducteur_occupe(v_conducteur_id)
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
$function$;

-- `create or replace` : ni signature ni type de retour ne bougent, donc aucun
-- re-grant. Les droits existants restent en place — et c'est vérifié par
-- l'inventaire de `010_schema.sql`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ SUR LE DISTANT, ET QUI VAUT D'ÊTRE ÉCRIT ICI
--
-- Le distant n'a pas reçu ce fichier tel quel : ses corps de fonctions
-- pouvaient diverger, alors la migration distante les a réécrits à partir de
-- `pg_get_functiondef()`, par un `replace`. Le motif remplacé ne couvrait que
-- `statut in (...)` et laissait `where conducteur_id = X and` devant lui — or
-- la variable s'appelle `v_uid` dans l'une et `v_conducteur_id` dans l'autre.
--
-- LA MIGRATION A RÉUSSI. `submit_offer` était morte : plpgsql ne compile son
-- corps qu'à la PREMIÈRE EXÉCUTION, et aucun conducteur ne pouvait plus
-- proposer de prix. Une migration verte ne prouve rien sur une fonction plpgsql.
--
-- Deux règles en sortent, et elles valent au-delà de ce fichier :
--   1. un `replace` de code remplace une expression ENTIÈRE et refermée, jamais
--      un morceau qui laisse du contexte derrière lui ;
--   2. après toute migration touchant une fonction plpgsql, on l'APPELLE.
--      C'est l'appel qui prouve, pas le « success ».
