-- Flex — cinq pièces, et la photo du véhicule servie au passager.
--
-- ============================================ LE COMPTE N'EST PLUS UN NOMBRE
-- `decider_document()` validait un dossier sur `count(*) filter (...) = 4`. Le
-- 4 était le nombre de pièces du jour où la fonction a été écrite : ajouter une
-- pièce le rendait faux en silence, et un dossier incomplet serait passé pour
-- complet. La règle nomme désormais les pièces qu'elle exige. Ajouter la
-- suivante se fera dans CE tableau, à un endroit qui se lit.
--
-- ================================== CE QUE ÇA FAIT AUX CONDUCTEURS EXISTANTS
-- Ils avaient quatre pièces validées ; il en faut cinq. La migration remet donc
-- `documents_valides_le` à null pour qui n'a pas la photo. C'est délibéré :
-- laisser passer ceux d'avant créerait deux catégories de conducteurs, dont une
-- qu'aucune règle ne décrit. Ils reprennent la route dès la photo validée.
create or replace function public.decider_document(
  p_profil uuid,
  p_type public.type_document,
  p_valide boolean,
  p_motif text default null
)
returns public.documents_conducteur
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc public.documents_conducteur;
  v_complet boolean;
begin
  -- Deux verrous plutôt qu'un : le `grant` dit qui peut appeler, ce test dit
  -- qui a le droit. Le jour où le grant s'élargit par distraction, celui-ci
  -- tient encore.
  if v_uid is not null and not public.est_admin(v_uid) then
    raise exception 'reserve_admin'
      using errcode = 'P0001',
            detail = 'Seul un profil administrateur décide d''un dossier.';
  end if;

  if not p_valide and nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'motif_requis'
      using errcode = 'P0001',
            detail = 'Un refus sans motif ne se corrige pas.';
  end if;

  update public.documents_conducteur
  set statut = (case when p_valide then 'valide' else 'refuse' end)::public.statut_document,
      motif_refus = case when p_valide then null else btrim(p_motif) end,
      decide_le = now()
  where profil_id = p_profil and type = p_type
  returning * into v_doc;

  if v_doc.profil_id is null then
    raise exception 'document_introuvable' using errcode = 'P0001';
  end if;

  -- Le journal, avant tout le reste : une décision non tracée est une décision
  -- qu'on ne pourra pas défendre.
  insert into public.decisions_documents (profil_id, type, decide_par, valide, motif)
  values (p_profil, p_type, coalesce(v_uid, p_profil), p_valide,
          case when p_valide then null else btrim(p_motif) end);

  -- LES PIÈCES SONT NOMMÉES, pas comptées.
  select bool_and(exists (
           select 1 from public.documents_conducteur d
           where d.profil_id = p_profil and d.type = t and d.statut = 'valide'))
    into v_complet
  from unnest(array[
    'piece_identite', 'permis', 'carte_grise', 'selfie', 'photo_vehicule'
  ]::public.type_document[]) t;

  update public.profiles
  set documents_valides_le = case when v_complet then now() else null end
  where id = p_profil;

  return v_doc;
end;
$$;

revoke all on function public.decider_document(uuid, public.type_document, boolean, text)
  from public, anon, authenticated;
grant execute on function public.decider_document(uuid, public.type_document, boolean, text)
  to authenticated;

-- Les dossiers d'avant : remis à l'état réel.
update public.profiles p
   set documents_valides_le = null
 where p.documents_valides_le is not null
   and not exists (
     select 1 from public.documents_conducteur d
     where d.profil_id = p.id and d.type = 'photo_vehicule' and d.statut = 'valide'
   );

-- ======================================== la photo, servie au passager
-- Le passager voit la voiture qui vient le chercher. C'est la même information
-- que le modèle et la couleur, en plus utile : on reconnaît une voiture avant de
-- lire une plaque.
--
-- Elle est projetée depuis `documents_conducteur`, et SEULEMENT si elle est
-- validée. Une photo en attente n'est vue de personne — ni le passager, ni un
-- conducteur qui aurait envoyé n'importe quoi.
--
-- Changer le type de retour d'une vue = drop + create = re-grant obligatoire.
drop view if exists public.vehicules_publics;

create view public.vehicules_publics
with (security_invoker = false) as
  select
    v.id,
    v.conducteur_id,
    v.modele,
    v.couleur,
    (select d.chemin
       from public.documents_conducteur d
      where d.profil_id = v.conducteur_id
        and d.type = 'photo_vehicule'
        and d.statut = 'valide') as photo_chemin
  from public.vehicles v
  where v.actif;

revoke all on public.vehicules_publics from public, anon, authenticated;
grant select on public.vehicules_publics to authenticated;

comment on view public.vehicules_publics is
  'Le véhicule tel que le passager le voit : modèle, couleur, et la photo SI elle est validée. Jamais la plaque — elle n''est servie qu''à la contrepartie d''une course acceptée.';
