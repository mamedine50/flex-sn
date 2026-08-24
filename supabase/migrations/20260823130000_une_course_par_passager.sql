-- Flex — une course à la fois vaut aussi pour le passager.
--
-- ================================================== LE TROU
-- Deux relectures d'architecture ont demandé « existe-t-il une contrainte
-- symétrique côté passager ? ». Vérification faite : non. Le conducteur est
-- tenu par un index unique partiel sur `conducteur_id` ; le passager n'avait
-- qu'une garde sur les demandes OUVERTES.
--
-- Or après acceptation la demande passe à « verrouillee ». La garde ne mordait
-- donc plus, et un passager en pleine course pouvait en commander une seconde.
--
-- ================================== POURQUOI C'EST PLUS GRAVE QU'IL N'Y PARAÎT
-- Personne ne perd d'argent côté passager. C'est le SECOND CONDUCTEUR qui se
-- déplace pour rien — carburant et temps, sans course au bout. Un trajet perdu
-- est ce qu'un marché de course produit de plus cher, et c'est toujours le
-- conducteur qui le paie.
--
-- ================================== POURQUOI UNE FONCTION ET PAS UN INDEX
-- Un index unique partiel sur `rides (passager_id) where course_active` dirait
-- la même chose, mais il se déclencherait à l'ACCEPTATION — trop tard, la
-- demande serait déjà partie et des conducteurs auraient déjà répondu. Le refus
-- doit tomber quand on COMMANDE, avec un message qui se lit.

create or replace function public.create_ride_request(p_service service_course, p_depart_lat double precision, p_depart_lon double precision, p_depart_libelle text, p_destination_lat double precision, p_destination_lon double precision, p_destination_libelle text, p_prix_xof integer, p_recommandation_xof integer DEFAULT NULL::integer)
 RETURNS ride_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      using errcode = 'P0001', detail = 'Le pas de prix est de 100 FCFA.';
  end if;

  select * into v_bornes from public.bornes_prix where service = p_service;

  if p_prix_xof < v_bornes.min_xof or p_prix_xof > v_bornes.max_xof then
    raise exception 'prix_hors_bornes'
      using errcode = 'P0001',
            detail = format('Attendu entre %s et %s XOF, reçu %s.',
                            v_bornes.min_xof, v_bornes.max_xof, p_prix_xof);
  end if;

  -- UNE COURSE À LA FOIS VAUT AUSSI POUR LE PASSAGER.
  -- Le verrou existait pour le conducteur — index unique partiel sur
  -- `conducteur_id` — et pas pour lui. Après acceptation, sa demande passe à
  -- « verrouillee » : la garde ci-dessous, qui ne regarde que « ouverte », ne
  -- mordait plus. Un passager en pleine course pouvait donc en commander une
  -- seconde, et un second conducteur se déplaçait pour rien.
  --
  -- Un trajet perdu est ce qu'un marché de course produit de plus cher : il
  -- coûte du carburant et du temps à quelqu'un qui ne sera jamais payé pour ça.
  if exists (
    select 1 from public.rides r
    where r.passager_id = v_uid and public.course_active(r.statut)
  ) then
    raise exception 'course_deja_en_cours'
      using errcode = 'P0001',
            detail = 'Terminez votre course avant d''en commander une autre.';
  end if;

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

  -- Le journal. Mailles arrondies : aucune position exacte n'entre ici.
  insert into public.events_prix (
    demande_id, service, recommandation_xof, prix_propose_xof, prix_modifie,
    maille_depart_lat, maille_depart_lon, maille_arrivee_lat, maille_arrivee_lon,
    distance_m
  ) values (
    v_demande.id, p_service, p_recommandation_xof, p_prix_xof,
    p_recommandation_xof is null or p_recommandation_xof <> p_prix_xof,
    public.arrondir_zone(p_depart_lat), public.arrondir_zone(p_depart_lon),
    public.arrondir_zone(p_destination_lat), public.arrondir_zone(p_destination_lon),
    round(extensions.st_distance(
      extensions.st_setsrid(
        extensions.st_makepoint(p_depart_lon, p_depart_lat), 4326)::extensions.geography,
      extensions.st_setsrid(
        extensions.st_makepoint(p_destination_lon, p_destination_lat),
        4326)::extensions.geography))::integer
  );

  return v_demande;
end;
$function$;
