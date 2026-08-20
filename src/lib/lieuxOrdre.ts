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
