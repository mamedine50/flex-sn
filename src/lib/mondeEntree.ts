import { router } from 'expo-router';

import { basculer } from './monde';

/**
 * LES DEUX SEULES PORTES ENTRE LES MONDES.
 *
 * Il n'y a qu'une route — `/`, l'onglet Course — et c'est elle qui rend le monde
 * courant. Mais il y a DEUX entrées côté interface : le raccourci de l'accueil
 * passager et la ligne du Profil. Elles ont divergé une fois : la seconde
 * ramenait à l'accueil passager parce que l'état du monde était dupliqué par
 * appelant. Le magasin partagé a réglé la cause ; ces deux fonctions ferment la
 * porte, en donnant aux deux entrées littéralement le même appel.
 *
 * Le `replace` est là pour l'entrée qui vient d'AILLEURS que l'onglet Course —
 * le Profil. Depuis l'onglet lui-même il ne coûte rien : on y est déjà.
 */
export function entrerMondeConducteur(): void {
  basculer('conducteur');
  router.replace('/');
}

export function revenirMondePassager(): void {
  basculer('passager');
  router.replace('/');
}
