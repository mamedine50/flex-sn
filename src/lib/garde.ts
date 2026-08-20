import { router } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from './session';

/**
 * La garde de session.
 *
 * Règle : **on regarde d'abord, on s'inscrit quand on agit.** L'accueil et le
 * choix de lieu restent consultables sans session — demander un numéro à
 * quelqu'un qui vient juste d'ouvrir l'application, c'est le perdre.
 *
 * La garde emporte donc TOUJOURS le chemin d'origine, et la connexion y revient.
 * Renvoyer à l'accueil obligerait à re-choisir son trajet, et c'est exactement
 * le moment où l'on abandonne.
 */
export function cheminConnexion(retour: string) {
  return `/connexion?retour=${encodeURIComponent(retour)}` as const;
}

/**
 * Pour un écran qu'on ne peut pas OUVRIR sans session — mode conducteur, course,
 * dossier. La redirection part au montage.
 */
export function useGardeSession(retour: string) {
  const session = useSession();

  useEffect(() => {
    if (session.statut === 'anonyme') router.replace(cheminConnexion(retour));
  }, [session.statut, retour]);

  return session.statut;
}

/**
 * Pour une ACTION sur un écran consultable sans session — « Envoyer ma
 * proposition ». Rend `false` et détourne vers la connexion s'il n'y a personne.
 */
export function exigerSession(
  statut: 'chargement' | 'connecte' | 'anonyme',
  retour: string,
): boolean {
  if (statut === 'connecte') return true;
  if (statut === 'anonyme') router.push(cheminConnexion(retour));
  return false;
}
