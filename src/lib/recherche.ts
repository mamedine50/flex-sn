/**
 * Recherche de lieu, en local.
 *
 * Pas de réseau, pas de service de géocodage : on filtre la table des communes
 * déjà chargée. Ce fichier ne dépend de RIEN — c'est du texte, et un test doit
 * pouvoir le vérifier sans monter un client Supabase.
 */

/** Ce que la recherche compare : sans accents, sans casse, sans séparateurs. */
export type Cherchable = { nom: string; alias: string[] };

/**
 * « grand yoff », « Grand-Yoff » et « GRAND YOFF » doivent tomber sur la même
 * commune : personne ne tape un tiret ni un accent dans un champ de recherche,
 * et une recherche qui ne trouve pas ce qu'on tape est une recherche cassée.
 */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Le nom OU un de ses noms d'usage contient-il la recherche ? */
export function communeCorrespond(commune: Cherchable, recherche: string): boolean {
  const cible = normaliser(recherche);
  if (cible === '') return true;
  if (normaliser(commune.nom).includes(cible)) return true;
  return commune.alias.some((a) => normaliser(a).includes(cible));
}
