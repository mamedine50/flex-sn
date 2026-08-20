-- Flex — retirer sa demande.
--
-- Trou trouvé à l'inventaire de clôture : `statut_demande` porte `'annulee'`
-- depuis la première migration, et RIEN dans le schéma ne pose jamais cette
-- valeur. Un passager qui se trompe de destination n'avait aucune sortie : il
-- attendait l'expiration en regardant arriver des offres qu'il ne voulait plus.
--
-- Un état conçu et inatteignable est un état qui n'existe pas.
create function public.annuler_demande(p_demande_id uuid)
returns public.ride_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_demande public.ride_requests;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  -- `for update` : sans le verrou, une acceptation concurrente pourrait
  -- verrouiller la demande entre la lecture du statut et l'écriture, et on
  -- annulerait une course déjà promise à un conducteur qui roule.
  select * into v_demande
  from public.ride_requests where id = p_demande_id for update;

  if v_demande.id is null then
    raise exception 'demande_introuvable' using errcode = 'P0001';
  end if;

  if v_demande.passager_id <> v_uid then
    raise exception 'demande_etrangere'
      using errcode = 'P0001',
            detail = 'On n''annule que sa propre demande.';
  end if;

  -- Une demande verrouillée n'est plus une demande : c'est une course, et une
  -- course s'annule par `annuler_course()`, qui prévient le conducteur.
  if v_demande.statut = 'verrouillee' then
    raise exception 'demande_verrouillee'
      using errcode = 'P0001',
            detail = 'Une course est déjà verrouillée : passez par annuler_course().';
  end if;

  if v_demande.statut <> 'ouverte' then
    raise exception 'demande_indisponible'
      using errcode = 'P0001',
            detail = format('Statut : %s.', v_demande.statut);
  end if;

  update public.ride_requests
  set statut = 'annulee'
  where id = p_demande_id
  returning * into v_demande;

  -- Les offres en attente tombent avec la demande. Sans ça, un conducteur
  -- garderait une offre « en attente » sur une demande qui n'existe plus, et
  -- attendrait une réponse qui ne viendrait jamais.
  update public.offers
  set statut = 'caduque'
  where demande_id = p_demande_id and statut = 'en_attente';

  return v_demande;
end;
$$;

revoke all on function public.annuler_demande(uuid) from public, anon, authenticated;
grant execute on function public.annuler_demande(uuid) to authenticated;

comment on function public.annuler_demande(uuid) is
  'Retire une demande ENCORE OUVERTE. Après verrouillage c''est annuler_course() qui s''applique — la distinction n''est pas cosmétique : une course a un conducteur en route.';
