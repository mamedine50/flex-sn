import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { lire, ecrire, effacer } from './stockage';
import { supabase } from './supabase';

/**
 * Deux mondes, une bascule — et UN SEUL état pour toute l'application.
 *
 * LE DÉFAUT QUI A IMPOSÉ CETTE FORME. Le monde vivait dans un `useState` par
 * appelant. Le Profil et l'accueil en avaient donc chacun une copie. Basculer
 * depuis le Profil changeait SA copie et écrivait au stockage ; l'onglet
 * d'accueil, déjà monté — une barre d'onglets ne démonte pas ses écrans — gardait
 * la sienne et ne relisait rien. « Passer en mode conducteur » ramenait donc à
 * l'accueil passager, tandis que « Passer en ligne », qui basculait la copie de
 * l'accueil lui-même, fonctionnait. Une entrée sur deux, et rien dans le code ne
 * le disait : les deux lignes étaient identiques.
 *
 * D'où un magasin de module et `useSyncExternalStore`. Il n'y a plus de copie à
 * désynchroniser, donc plus d'entrée privilégiée : tout appelant lit la même
 * valeur, dans le même rendu.
 *
 * LA RÈGLE DE SURVIE, elle, n'a pas changé. Le passager par défaut ; le
 * conducteur seulement pour qui en a la capacité, et seulement APRÈS un geste :
 * on n'ouvre jamais l'application directement en ligne. Un aller-retour au
 * premier plan GARDE le monde — répondre à un appel ne fait pas perdre sa place ;
 * un démarrage À FROID revient au monde passager. La marque est donc écrite avec
 * l'instant et relue avec une péremption : sans horodatage, on ne distingue pas
 * les deux cas, le stockage survit aux deux.
 *
 * ET LE MONDE MEURT AVEC LA SESSION. Sans ça, le compte SUIVANT sur ce téléphone
 * démarrerait dans le monde conducteur d'un autre.
 */
const CLE = 'flex.monde';

/** Au-delà, on considère que l'application a été fermée, pas mise de côté. */
const PEREMPTION_MS = 5 * 60 * 1000;

export type Monde = 'passager' | 'conducteur';

let monde: Monde = 'passager';
let pret = false;
const abonnes = new Set<() => void>();

function prevenir(): void {
  abonnes.forEach((rappel) => rappel());
}

/** Change la valeur en mémoire et réveille tout le monde. Sans écriture. */
function poser(suivant: Monde): void {
  if (monde === suivant) return;
  monde = suivant;
  prevenir();
}

export function mondeCourant(): Monde {
  return monde;
}

export function mondePret(): boolean {
  return pret;
}

/** La bascule. Le seul chemin vers l'autre monde, quelle que soit l'entrée. */
export function basculer(suivant: Monde): void {
  poser(suivant);
  void ecrire(CLE, `${suivant}|${Date.now()}`);
}

let demarre = false;

/**
 * Démarrage paresseux : à la PREMIÈRE souscription, pas à l'import. Un module
 * qui pose des écouteurs en s'important les pose aussi sous les tests et dans
 * les outils, où personne ne les enlève.
 */
function demarrer(): void {
  if (demarre) return;
  demarre = true;

  void (async () => {
    const brut = await lire(CLE);
    const [valeur, instant] = (brut ?? '').split('|');
    const frais = Number(instant) > Date.now() - PEREMPTION_MS;
    if (valeur === 'conducteur' && frais) monde = 'conducteur';
    pret = true;
    prevenir();
  })();

  // On repousse la péremption à chaque retour au premier plan : c'est ce qui
  // fait qu'une pause de deux minutes ne coûte pas sa session.
  AppState.addEventListener('change', (etat) => {
    if (etat !== 'active') return;
    if (monde === 'conducteur') void ecrire(CLE, `conducteur|${Date.now()}`);
  });

  supabase.auth.onAuthStateChange((evenement) => {
    if (evenement !== 'SIGNED_OUT') return;
    poser('passager');
    void effacer(CLE);
  });
}

export function abonnerMonde(rappel: () => void): () => void {
  demarrer();
  abonnes.add(rappel);
  return () => {
    abonnes.delete(rappel);
  };
}

/** Remise à zéro — pour les tests seulement. */
export function reinitialiserMondePourTest(): void {
  monde = 'passager';
  pret = false;
  abonnes.clear();
}

export function useMonde() {
  const monde = useSyncExternalStore(abonnerMonde, mondeCourant);
  const pret = useSyncExternalStore(abonnerMonde, mondePret);
  return { monde, pret, basculer };
}
