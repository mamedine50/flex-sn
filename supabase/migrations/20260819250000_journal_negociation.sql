-- Flex — le journal se complète au fil de la négociation.
--
-- `submit_offer()` et `accept_offer()` gardent leur signature et leur type de
-- retour : `create or replace` suffit, les droits survivent.

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
$$;

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

  if v_demande.passager_id <> v_uid then
    raise exception 'demande_etrangere'
      using errcode = 'P0001',
            detail = 'Cette offre répond à la demande de quelqu''un d''autre.';
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
    v_demande.id, v_offre.id, v_uid, v_conducteur_id,
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

  -- Le prix réellement convenu : c'est LUI qui dit ce que vaut la route, pas le
  -- prix proposé.
  update public.events_prix
  set prix_convenu_xof = v_offre.prix_xof
  where demande_id = v_demande.id;

  return v_course;
end;
$$;

-- ------------------------------------------------------------ stats_routes --
create view public.stats_routes
with (security_invoker = false) as
select
  e.maille_depart_lat,
  e.maille_depart_lon,
  e.maille_arrivee_lat,
  e.maille_arrivee_lon,
  count(*)::integer as nb_demandes,
  round(
    count(*) filter (where e.nb_offres > 0)::numeric / nullif(count(*), 0), 3
  ) as taux_reponse,
  round(avg(e.distance_m))::integer as distance_moyenne_m,
  count(*) filter (where e.prix_modifie and e.prix_convenu_xof is not null)::integer
    as nb_prix_libres_conclus,
  percentile_cont(0.25) within group (order by e.prix_convenu_xof)
    filter (where e.prix_modifie and e.prix_convenu_xof is not null)
    as p25_prix_convenu_xof
from public.events_prix e
group by 1, 2, 3, 4;

comment on view public.stats_routes is
$c$Agrégat par route (maille → maille) pour calibrer les tarifs.

Le 25e centile ne porte QUE sur les demandes où `prix_modifie` est vrai. C'est le
garde-fou anti-boucle, et c'est la seule chose qui compte dans cette vue : un prix
accepté sans que le passager touche au pré-rempli ne dit rien du marché, il ne fait
que renvoyer notre propre recommandation. Une recommandation qui apprendrait de ses
propres échos se figerait en tarif fixe en six mois, avec la conviction d'avoir
mesuré quelque chose.

Aucune interface ne lit cette vue, et la recommandation n'en dépend pas. La bascule
formule → observé se fera à la main, route par route, quand les volumes existeront.$c$;

revoke all on public.stats_routes from anon, authenticated;
grant select on public.stats_routes to service_role;
