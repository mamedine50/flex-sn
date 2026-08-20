/**
 * La session de développement — ce qu'il en reste.
 *
 * `dev@flex.test` a été SUPPRIMÉ. Il ouvrait une session sans OTP avec un mot
 * de passe versionné dans le dépôt, sur le projet distant : une porte d'entrée
 * que n'importe quel lecteur du code pouvait pousser.
 *
 * Une application ne peut pas se fabriquer une session toute seule sans porte
 * dérobée — il lui faudrait la clé `service_role`, et cette clé annule la RLS.
 * Le jeton vient donc de DEHORS :
 *
 *     node scripts/session-locale.mjs
 *
 * Le script tourne sur la pile LOCALE, crée un compte éphémère, et rend un lien
 * `exp://…/--/session-dev?jeton=…`. L'application échange ce jeton avec sa clé
 * anonyme, comme n'importe quel lien magique.
 */
export const MODE_EMPLOI_SESSION =
  'node scripts/session-locale.mjs — puis ouvrir le lien affiché';

export async function fermerSessionDeTest() {
  const { supabase } = await import('./supabase');
  const { error } = await supabase.auth.signOut();
  return { ok: !error, message: error?.message ?? '' };
}
