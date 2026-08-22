import { router, type Href } from 'expo-router';

import { supabase } from './supabase';

/**
 * Où aller une fois connecté.
 *
 * Deux règles, dans cet ordre :
 *
 * 1. **Le prénom d'abord, s'il est encore au repli.** Le déclencheur
 *    d'inscription pose `'Passager'` quand aucun prénom n'accompagne
 *    l'inscription. Laisser passer, c'est un conducteur qui voit « Passager »
 *    à la place d'un nom, pour toujours — personne ne va chercher ce réglage.
 * 2. **Sinon, on revient d'où l'on venait.** Jamais à l'accueil : l'utilisateur
 *    a déjà choisi son trajet, le lui faire recommencer est le meilleur moyen
 *    de le perdre.
 */
export const PRENOM_AU_REPLI = 'Passager';

export async function apresConnexion(retour?: string | null) {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;

  if (uid) {
    const { data: profil } = await supabase
      .from('profiles')
      .select('prenom')
      .eq('id', uid)
      .maybeSingle();

    if (!profil || profil.prenom === PRENOM_AU_REPLI) {
      router.replace({
        pathname: '/connexion/prenom',
        params: { retour: retour ?? '' },
      });
      return;
    }
  }

  reprendre(retour);
}

/**
 * Reprend le chemin d'origine, ou l'accueil s'il n'y en a pas.
 *
 * `dismissAll()` AVANT le `replace`, et c'est tout le sujet. La connexion est un
 * PARCOURS, pas un écran : `connexion/index` empile `connexion/code`, qui empile
 * parfois `connexion/prenom`. Un `replace` seul ne remplace que le sommet — les
 * écrans du dessous survivent. Résultat observé sur un téléphone : depuis le
 * profil, un balayage vers l'arrière ramenait l'écran « Votre numéro », déjà
 * connecté, avec le numéro encore dedans.
 *
 * Ce n'est pas cosmétique. Un écran de connexion accessible d'un geste après
 * s'être connecté invite à se reconnecter, envoie un second code, et laisse
 * croire que la session n'a pas pris.
 *
 * `dismissAll` vide la pile de tout ce qui a été empilé, `replace` pose la
 * destination à la place de ce qui reste. Il ne subsiste donc rien de la
 * connexion. Le bouton « Retour » de la destination continue de fonctionner :
 * tous les écrans retombent sur l'accueil quand la pile est vide.
 */
export function reprendre(retour?: string | null) {
  const chemin = retour && retour.startsWith('/') ? retour : '/';
  if (router.canDismiss()) router.dismissAll();
  router.replace(chemin as Href);
}
