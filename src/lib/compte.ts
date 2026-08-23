import { router } from 'expo-router';

import { oublierAppareil } from './push';
import { supabase } from './supabase';

/**
 * Supprimer son compte, depuis l'application.
 *
 * L'ORDRE EST LE SUJET. Les fichiers — pièce d'identité, permis, carte grise,
 * selfie — ne peuvent pas partir en SQL : Supabase interdit le `delete` direct
 * dans `storage.objects`, y compris au propriétaire de la base. C'est donc le
 * client qui les efface, par l'API de stockage, avec la session de la personne.
 *
 * D'où trois temps, et pas deux :
 *
 * 1. DEMANDER si c'est possible. Sans cette question, on effacerait les pièces
 *    AVANT de découvrir qu'une course active interdit la suppression : la
 *    personne aurait perdu son dossier pour rien et devrait tout reprendre.
 * 2. EFFACER LES FICHIERS. Tant que la session vit.
 * 3. SUPPRIMER. La fonction refait la vérification — une course peut commencer
 *    entre deux appels, et c'est le serveur qui tranche, pas nous.
 *
 * Si l'effacement des fichiers échoue, ON S'ARRÊTE. Supprimer le compte en
 * laissant les pièces d'identité derrière serait le pire des deux mondes : plus
 * personne pour les réclamer, et elles sont toujours là.
 */
const SEAUX = ['documents-conducteur', 'photos-profil'] as const;

export type EchecSuppression = 'course_active' | 'fichiers' | 'serveur';

async function effacerFichiers(uid: string): Promise<boolean> {
  for (const seau of SEAUX) {
    const { data, error } = await supabase.storage.from(seau).list(uid);
    if (error) return false;
    if (!data || data.length === 0) continue;

    const chemins = data.map((f) => `${uid}/${f.name}`);
    const { error: echec } = await supabase.storage.from(seau).remove(chemins);
    if (echec) return false;
  }
  return true;
}

export async function supprimerMonCompte(): Promise<{ erreur: EchecSuppression | null }> {
  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return { erreur: 'serveur' };

  const { data: possible, error: erreurQuestion } =
    await supabase.rpc('suppression_possible');
  if (erreurQuestion) return { erreur: 'serveur' };
  if (possible !== true) return { erreur: 'course_active' };

  if (!(await effacerFichiers(uid))) return { erreur: 'fichiers' };

  const { error } = await supabase.rpc('supprimer_mon_compte');
  if (error) {
    return { erreur: error.message.includes('course_active') ? 'course_active' : 'serveur' };
  }

  // Le serveur a détruit la session côté base ; on ferme la nôtre pour que
  // l'application n'attende pas le prochain rafraîchissement de jeton.
  // On détache l'appareil AVANT de fermer la session : après, la RPC n'aurait
  // plus de `auth.uid()` et le jeton resterait attaché à un compte fermé. Le
  // téléphone continuerait de recevoir les notifications de quelqu'un qui s'est
  // délibérément déconnecté — et qui a peut-être rendu l'appareil.
  await oublierAppareil();
  await supabase.auth.signOut();
  router.replace('/');
  return { erreur: null };
}
