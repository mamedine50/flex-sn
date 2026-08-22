-- Flex — une pièce validée ne se redépose plus.
--
-- ================================================== LE CONTOURNEMENT
-- `soumettre_document()` acceptait un dépôt QUEL QUE SOIT le statut de la
-- pièce, y compris `valide`. Un conducteur confirmé pouvait donc remplacer une
-- pièce déjà approuvée. La ligne repassait en `en_attente` — mais
-- `documents_valides_le` n'est recalculé que par `decider_document()`, et
-- personne ne décidait rien.
--
-- Résultat : `est_conducteur()` restait VRAI, le conducteur continuait de
-- rouler, et le fichier derrière sa pièce d'identité était devenu n'importe
-- quoi. L'écran cachait déjà le dépôt à un dossier complet ; un écran qui cache
-- n'est pas un serveur qui refuse.
--
-- ============================================ CE QU'ON GARDE OUVERT
-- REDÉPOSER APRÈS UN REFUS RESTE POSSIBLE — c'est tout l'intérêt d'un refus
-- motivé. Et une pièce ENCORE EN ATTENTE se remplace : on a le droit de
-- s'apercevoir que la photo est floue avant que l'admin la regarde.
--
-- Seule la pièce VALIDE est scellée. Pour la changer — un permis qui expire, un
-- véhicule qui change — il faut passer par l'administration, qui l'invalide
-- d'abord. C'est le sens d'une validation : quelqu'un a regardé, et ce qu'il a
-- regardé ne bouge plus dans son dos.
create or replace function public.soumettre_document(
  p_type public.type_document,
  p_chemin text
)
returns public.documents_conducteur
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc public.documents_conducteur;
  v_statut public.statut_document;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_chemin !~ ('^' || v_uid::text || '/') then
    raise exception 'chemin_etranger'
      using errcode = 'P0001',
            detail = 'Un document se dépose dans son propre dossier.';
  end if;

  select d.statut into v_statut
  from public.documents_conducteur d
  where d.profil_id = v_uid and d.type = p_type;

  if v_statut = 'valide' then
    raise exception 'piece_validee'
      using errcode = 'P0001',
            detail = 'Une pièce validée ne se remplace pas. Passez par l''administration.';
  end if;

  insert into public.documents_conducteur (profil_id, type, chemin)
  values (v_uid, p_type, btrim(p_chemin))
  on conflict (profil_id, type) do update
    -- Redéposer après un refus remet la pièce en attente, et efface le motif :
    -- un motif qui survit à la correction accuse de quelque chose de corrigé.
    set chemin = excluded.chemin,
        statut = 'en_attente',
        motif_refus = null,
        cree_le = now(),
        decide_le = null
  returning * into v_doc;

  return v_doc;
end;
$$;

comment on function public.soumettre_document(public.type_document, text) is
  'Dépose une pièce du dossier. Refuse une pièce déjà VALIDE : ce qu''un admin a regardé ne bouge plus dans son dos. Un refus ou une attente se redéposent librement.';
