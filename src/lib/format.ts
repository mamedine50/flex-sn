/**
 * Formatage des montants. Une seule fonction, un seul rendu, toutes langues
 * confondues : `2 500 FCFA`.
 *
 * Les deux espaces sont insécables (U+00A0) — celle des milliers et celle qui
 * précède `FCFA`. Un montant coupé en fin de ligne se lit de travers, et
 * « 2 500 » sur deux lignes se lit « 2 » puis « 500 ».
 */

/** Espace insécable. Jamais une espace ordinaire, jamais une virgule. */
export const ESPACE_INSECABLE = ' ';

export const DEVISE = 'FCFA';

/** Incrément de prix, en XOF. C'est l'unité réelle de la monnaie. */
export const PAS_XOF = 100;

/** Sépare les milliers par une espace insécable : `2500` → `2 500`. */
export function separerMilliers(entier: number): string {
  const signe = entier < 0 ? '-' : '';
  const chiffres = Math.abs(entier).toString();
  const groupes: string[] = [];
  for (let i = chiffres.length; i > 0; i -= 3) {
    groupes.unshift(chiffres.slice(Math.max(0, i - 3), i));
  }
  return signe + groupes.join(ESPACE_INSECABLE);
}

/**
 * `2500` → `2 500 FCFA`.
 *
 * Le montant est un entier XOF. Un flottant ou une valeur non finie est une
 * erreur de programmation, pas une donnée à arrondir en silence.
 */
export function formatXof(montant: number): string {
  if (!Number.isFinite(montant) || !Number.isInteger(montant)) {
    throw new Error(
      `formatXof attend un entier XOF, reçu : ${String(montant)}`,
    );
  }
  return `${separerMilliers(montant)}${ESPACE_INSECABLE}${DEVISE}`;
}

/** Arrondit au pas de 100 F. Utilisé par les boutons − / + et les bornes. */
export function arrondirAuPas(montant: number, pas: number = PAS_XOF): number {
  return Math.round(montant / pas) * pas;
}
