-- Flex — une fonction de déclencheur n'a rien à faire dans l'API.
--
-- Signalé par les advisors : `creer_profil_a_l_inscription()` était exécutable
-- par `anon` via /rest/v1/rpc/. Appelée directement elle échouerait — Postgres
-- refuse d'exécuter une fonction de déclencheur hors déclencheur — mais elle
-- n'avait aucune raison d'être exposée, et les droits par défaut de Supabase
-- l'avaient accordée sans qu'on le demande.
--
-- La leçon est générale : toute fonction créée dans `public` reçoit `execute`
-- pour anon et authenticated. Il faut le retirer nommément, y compris pour les
-- fonctions qui ne sont pas censées être appelées.
revoke all on function public.creer_profil_a_l_inscription()
  from public, anon, authenticated;
