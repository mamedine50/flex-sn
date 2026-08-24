import { router } from 'expo-router';

import { quitterLaLigne } from './conducteur';
import { oublierAppareil } from './push';
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

  // L'appareil se détache AVANT la fermeture de session, pour la même raison
  // que la mise hors ligne : après, `oublier_jeton_push()` n'aurait plus de
  // `auth.uid()`. Le téléphone continuerait de recevoir les notifications de
  // quelqu'un qui vient de partir — et qui l'a peut-être rendu.
  //
  // On n'abandonne PAS si ça échoue, contrairement à la mise hors ligne : un
  // push de trop est un désagrément, rester en ligne dans le dos des passagers
  // est un dysfonctionnement.
  await oublierAppareil();

  await supabase.auth.signOut();

  // On repart de l'ACCUEIL. Depuis que la connexion est obligatoire, la porte
  // y renvoie aussitôt vers l'écran du numéro — et c'est très bien : c'est ELLE
  // qui décide où va quelqu'un sans session, pas cette fonction. Écrire
  // `/connexion` ici dupliquerait la règle à un second endroit, et les deux
  // finiraient par diverger.
  router.replace('/');
  return { erreur: false };
}
