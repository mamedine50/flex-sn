-- Flex — les avis qu'on a reçus, et seulement les siens.
--
-- DÉFAUT CORRIGÉ ICI, trouvé en câblant l'écran « Mes avis » :
-- `evaluations_visibles` est une vue en `security definer`, elle ne filtre PAS
-- l'appelant, et `select` était accordé à `authenticated`. N'importe quel compte
-- connecté pouvait donc lire les notes ET les commentaires libres de n'importe
-- qui. Aucun écran ne s'en servait, donc rien ne l'avait révélé.
--
-- On ne peut pas simplement filtrer cette vue : `recalculer_notes()` s'en sert
-- pour calculer les moyennes, et y ajouter un `auth.uid()` la casserait — la
-- tâche planifiée tourne sans utilisateur, et un notant ne verrait que sa propre
-- ligne. Elle redevient donc INTERNE, et le client reçoit une vue à lui.
revoke select on public.evaluations_visibles from authenticated;

comment on view public.evaluations_visibles is
  'INTERNE — ne rien accorder au client. Elle ne filtre pas l''appelant : c''est voulu, `recalculer_notes()` doit voir toutes les lignes dévoilées. Le client passe par `mes_evaluations`.';

-- ------------------------------------------------------------ ce que je vois --
-- Les avis REÇUS, dévoilés, et rien d'autre.
--
-- Pas d'`auteur_id` : on ne dit jamais QUI a noté. Un conducteur qui sait quel
-- passager lui a mis deux étoiles, c'est une représaille en puissance — et le
-- double aveugle ne sert à rien s'il se lève à la lecture.
create view public.mes_evaluations
with (security_invoker = false) as
select
  v.course_id,
  v.note,
  v.commentaire,
  v.cree_le,
  c.terminee_le
from public.evaluations_visibles v
join public.rides c on c.id = v.course_id
where v.cible_id = (select auth.uid());

revoke all on public.mes_evaluations from anon, authenticated;
grant select on public.mes_evaluations to authenticated;

comment on view public.mes_evaluations is
  'Avis REÇUS par l''appelant, une fois dévoilés. Ne JAMAIS y ajouter auteur_id : savoir qui a noté ouvre la porte aux représailles.';
