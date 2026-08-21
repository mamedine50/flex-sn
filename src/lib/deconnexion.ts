import { router } from 'expo-router';

import { quitterLaLigne } from './conducteur';
import { supabase } from './supabase';

/**
 * Se déconnecter proprement.
 *
 * L'ORDRE N'EST PAS NÉGOCIABLE : hors ligne D'ABORD, session ensuite.
 *
 * `en_ligne` vit en base, pas dans l'écran — c'est ce qui fait qu'un conducteur
 * qui a fermé l'application ne se croit pas hors ligne alors qu'il reçoit
 * toujours des demandes. Le revers est qu'une déconnexion qui ne fait que
 * `signOut()` laisse la ligne à VRAI pour toujours : le conducteur disparaît de
 * son téléphone mais reste dans la file des passagers, qui lui envoient des
 * offres auxquelles personne ne répondra. Et une fois la session fermée, plus
 * rien ne peut corriger la ligne — `maj_position()` exige d'être authentifié.
 *
 * D'où la séquence, et d'où le fait qu'on n'abandonne PAS si la mise hors ligne
 * échoue : rester connecté est le moindre mal, on redit à l'utilisateur
 * d'essayer plutôt que de le laisser en ligne dans le dos de tout le monde.
 *
 * Le monde, lui, s'efface tout seul : `useMonde()` écoute `SIGNED_OUT`.
 */
export async function seDeconnecter(): Promise<{ erreur: boolean }> {
  const { error } = await quitterLaLigne();
  if (error) return { erreur: true };

  await supabase.auth.signOut();

  // On repart de l'ACCUEIL, pas de la connexion : il se consulte sans compte, et
  // renvoyer vers un clavier numérique quelqu'un qui vient de partir est la
  // seule chose qu'il n'a pas demandée.
  router.replace('/');
  return { erreur: false };
}
