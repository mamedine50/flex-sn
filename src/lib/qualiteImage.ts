/**
 * Les garde-fous de qualité d'une pièce déposée.
 *
 * CE QU'ILS FONT, ET CE QU'ILS NE FONT PAS. Ils attrapent l'image manifestement
 * inexploitable : une capture d'écran minuscule, un recadrage de timbre-poste,
 * une photo presque uniforme — mur, plafond, doigt sur l'objectif. Ils
 * n'attrapent PAS un flou modéré : mesurer la netteté demande l'accès aux
 * pixels, donc un module natif, donc une reconstruction du client.
 *
 * LE VRAI FILTRE RESTE HUMAIN, ET IL EST À DEUX ÉTAGES : la personne confirme
 * elle-même que sa photo est lisible — on la lui montre en grand avant — puis
 * l'équipe la valide. Ces règles-ci évitent simplement de faire attendre
 * quelqu'un deux jours pour une image que personne n'aurait pu lire.
 *
 * Aucune ne devine : chacune répond à une question qu'on peut poser à une image
 * sans la regarder.
 */

/**
 * Le grand côté, AVANT réduction. En dessous, aucun texte de document n'est
 * lisible une fois compressé à 1200 px de large.
 */
export const COTE_MIN_PX = 900;

/**
 * Le poids après compression normalisée (1200 px de large, qualité 0,8).
 *
 * Une photo nette de document porte des milliers de contours — elle se compresse
 * mal, donc elle pèse. Une image floue ou presque unie se compresse
 * énormément. 60 ko est le plancher observé en dessous duquel il n'y a plus rien
 * à lire : c'est un seuil de PRÉSENCE d'information, pas de netteté.
 */
export const OCTETS_MIN = 60_000;

export type DefautQualite = 'trop_petite' | 'sans_detail';

/** `null` quand l'image passe. Sinon, ce qui cloche. */
export function defautDeQualite(
  largeur: number | undefined,
  hauteur: number | undefined,
  octets: number,
): DefautQualite | null {
  // Dimensions inconnues : on ne refuse pas sur une absence. Le poids reste
  // vérifié, et l'œil de la personne derrière.
  if (largeur && hauteur && Math.max(largeur, hauteur) < COTE_MIN_PX) {
    return 'trop_petite';
  }
  if (octets < OCTETS_MIN) return 'sans_detail';
  return null;
}
