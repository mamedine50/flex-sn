import { ecrire, lire } from './stockage';

/**
 * Ce qui ne se montre qu'une fois.
 *
 * Deux marques, deux raisons distinctes :
 *
 * - `localisation` : le pré-écran qui explique avant la boîte système. Le
 *   remontrer à chaque ouverture du sélecteur en ferait un péage.
 * - `couverture` : l'information « Flex est au Sénégal pour le moment ». On
 *   constate, on informe UNE fois, et on n'y revient pas. Répéter à quelqu'un
 *   qu'il est loin, c'est le mettre dehors.
 */
const CLES = {
  localisation: 'flex.premiereFois.localisation',
  couverture: 'flex.premiereFois.couverture',
} as const;

export type Marque = keyof typeof CLES;

export async function dejaVu(marque: Marque): Promise<boolean> {
  return (await lire(CLES[marque])) === '1';
}

export async function marquerVu(marque: Marque): Promise<void> {
  await ecrire(CLES[marque], '1');
}
