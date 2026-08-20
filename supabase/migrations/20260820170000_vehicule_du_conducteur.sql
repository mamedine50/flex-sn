-- Flex — le véhicule que le candidat déclare.
--
-- Défaut trouvé en faisant tourner l'écran « Conduire avec Flex » : les quatre
-- pièces validées posaient `documents_valides_le`, mais `est_conducteur()`
-- exige AUSSI un véhicule actif — et rien, nulle part, ne permettait d'en
-- déclarer un. Un dossier complet n'ouvrait donc rien du tout, et l'écran
-- annonçait le contraire.
--
-- La carte grise prouve le véhicule ; encore faut-il savoir DUQUEL il s'agit,
-- pour l'afficher au passager avec l'offre.

-- Une plaque active n'appartient qu'à un conducteur. Deux comptes qui
-- présentent la même voiture, c'est soit une erreur de saisie, soit une
-- usurpation — dans les deux cas on la refuse ici plutôt que dans la rue.
create unique index vehicles_plaque_active_unique
  on public.vehicles (upper(btrim(plaque))) where actif;

create function public.declarer_vehicule(
  p_plaque text,
  p_modele text,
  p_couleur text
)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_vehicule public.vehicles;
  v_plaque text := upper(btrim(coalesce(p_plaque, '')));
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if length(v_plaque) < 4 then
    raise exception 'plaque_invalide' using errcode = 'P0001';
  end if;

  -- La plaque tourne déjà, et pas pour cette personne.
  if exists (
    select 1 from public.vehicles v
    where v.actif and upper(btrim(v.plaque)) = v_plaque and v.conducteur_id <> v_uid
  ) then
    raise exception 'plaque_prise'
      using errcode = 'P0001',
            detail = 'Cette plaque est déjà déclarée par un autre conducteur.';
  end if;

  -- Un seul véhicule actif par conducteur en V1 : redéclarer remplace. Les
  -- anciens restent en base, désactivés — une course passée pointe dessus, et
  -- l'effacer réécrirait l'histoire.
  update public.vehicles
  set actif = false
  where conducteur_id = v_uid and actif and upper(btrim(plaque)) <> v_plaque;

  insert into public.vehicles (conducteur_id, plaque, modele, couleur, actif)
  values (v_uid, v_plaque, btrim(p_modele), btrim(p_couleur), true)
  on conflict (upper(btrim(plaque))) where actif do update
    set modele = excluded.modele,
        couleur = excluded.couleur
  returning * into v_vehicule;

  return v_vehicule;
end;
$$;

revoke all on function public.declarer_vehicule(text, text, text)
  from public, anon, authenticated;
grant execute on function public.declarer_vehicule(text, text, text) to authenticated;

comment on function public.declarer_vehicule(text, text, text) is
  'Déclare le véhicule actif du conducteur. Sans lui, un dossier complet n''ouvre pas la capacité : est_conducteur() exige documents validés ET véhicule actif.';
