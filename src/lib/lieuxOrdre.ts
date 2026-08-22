/**
 * L'ordre et le filtrage des résultats de recherche. Aucune dépendance : c'est
 * du tri, et un test ne doit pas monter un client Supabase pour le vérifier.
 */
import { communeCorrespond } from './recherche';

export type CategorieLieu =
  | 'quartier' | 'arret' | 'aeroport' | 'gare' | 'stade' | 'hotel'
  | 'hopital' | 'universite' | 'marche' | 'centre_commercial'
  | 'monument' | 'lieu_culte';

export type Lieu = {
  code: string;
  nom: string;
  alias: string[];
  categorie: CategorieLieu;
  lat: number;
  lon: number;
};

/**
 * Ce qui SITUE d'abord — quartiers et arrêts — puis les points de repère.
 * Quelqu'un qui tape « yoff » cherche le quartier, pas l'hôtel Yoff Beach.
 */
export const RANG: Record<CategorieLieu, number> = {
  quartier: 0,
  arret: 1,
  gare: 2,
  aeroport: 2,
  marche: 3,
  stade: 3,
  monument: 3,
  centre_commercial: 4,
  universite: 4,
  hopital: 4,
  hotel: 5,
  lieu_culte: 5,
};

/** Un glyphe sobre par catégorie : la couleur porte déjà du sens ailleurs. */
export const GLYPHE: Record<CategorieLieu, string> = {
  quartier: '◉',
  arret: '▣',
  aeroport: '✈',
  gare: '▤',
  stade: '◈',
  hotel: '▥',
  hopital: '✚',
  universite: '▲',
  marche: '▩',
  centre_commercial: '▦',
  monument: '★',
  lieu_culte: '☾',
};

export function chercherLieux(lieux: Lieu[], recherche: string, limite = 8): Lieu[] {
  if (recherche.trim() === '') return [];
  return lieux
    .filter((l) => communeCorrespond(l, recherche))
    .sort(
      (a, b) =>
        RANG[a.categorie] - RANG[b.categorie] || a.nom.localeCompare(b.nom, 'fr'),
    )
    .slice(0, limite);
}

/**
 * Le rayon au-delà duquel un lieu connu ne dit plus rien du point choisi.
 *
 * 800 m : à Dakar, c'est l'ordre de grandeur d'un quartier. Au-delà, nommer un
 * point d'après le repère le plus proche devient un mensonge utile à personne —
 * « près de Ouakam » à deux kilomètres de Ouakam n'aide pas le conducteur, il
 * l'égare.
 */
export const RAYON_NOMMAGE_M = 800;

function distanceApprox(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  // Équirectangulaire : à l'échelle d'un quartier, l'écart avec la formule
  // exacte est inférieur au mètre, et on compare des distances entre elles.
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = (((b.lon - a.lon) * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon) * R;
}

/**
 * Le lieu connu le plus proche d'un point, ou `null` s'il n'y en a pas à
 * portée.
 *
 * Sert à NOMMER un point posé sur la carte. Sans lui, un point choisi au doigt
 * s'appelait « Point sur la carte » — ce qui ne dit rien au conducteur qui le
 * lira, ni au passager qui relira sa propre demande.
 *
 * Tout est local : la table des lieux est embarquée. Aucun appel de géocodage,
 * qui serait facturé et interdit par les règles du produit.
 */
export function lieuLePlusProche(
  lieux: Lieu[],
  point: { lat: number; lon: number },
  rayonM = RAYON_NOMMAGE_M,
): Lieu | null {
  let meilleur: Lieu | null = null;
  let meilleure = Infinity;
  for (const l of lieux) {
    const d = distanceApprox(point, l);
    if (d < meilleure && d <= rayonM) {
      meilleure = d;
      meilleur = l;
    }
  }
  return meilleur;
}
