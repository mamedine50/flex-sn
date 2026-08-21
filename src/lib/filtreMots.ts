/**
 * Filtre d'affichage des commentaires d'évaluation.
 *
 * IL MASQUE, IL NE REFUSE PAS. Refuser à l'écriture apprend à contourner —
 * espaces, chiffres, fautes volontaires — et fait disparaître la preuve. On
 * enregistre donc le texte tel quel, on le masque à l'AFFICHAGE, et l'équipe
 * garde l'original pour traiter un signalement.
 *
 * CE QU'IL EST, ET CE QU'IL N'EST PAS. C'est le « filtre du grossier évident »
 * qu'exige la règle 1.2 de l'App Store : il attrape l'insulte lâchée en clair,
 * pas l'intention. Aucune liste ne modère à la place de quelqu'un — le
 * signalement et le blocage sont là pour ça.
 *
 * LA LISTE EST COURTE ET REMPLAÇABLE, exprès. Une longue liste attrape des mots
 * innocents : « connard » et « Konna » ne se ressemblent que pour une machine.
 * On compare donc sur des MOTS ENTIERS, jamais sur des fragments — sans quoi le
 * premier nom propre venu ressort étoilé, et l'application a l'air cassée.
 */

/**
 * Français et wolof, en clair. Sans accents ni majuscules : la comparaison
 * normalise des deux côtés.
 */
export const MOTS_INTERDITS: readonly string[] = [
  'connard',
  'connasse',
  'salope',
  'enculé',
  'encule',
  'pute',
  'putain',
  'batard',
  'bâtard',
  'merde',
  'ordure',
  'imbecile',
  'imbécile',
  'crétin',
  'cretin',
  'nègre',
  'negre',
  'rat',
  'chien',
];

/** Minuscules, sans accents. Les deux côtés de la comparaison y passent. */
function normaliser(mot: string): string {
  return mot
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const interdits = new Set(MOTS_INTERDITS.map(normaliser));

/**
 * Remplace chaque mot interdit par des étoiles, en gardant sa longueur.
 *
 * La ponctuation, les espaces et la casse du reste sont préservés : le lecteur
 * doit voir qu'on a masqué quelque chose, pas lire une phrase recomposée.
 */
export function masquerGrossieretes(texte: string): string {
  return texte.replace(/\p{L}+/gu, (mot) =>
    interdits.has(normaliser(mot)) ? '*'.repeat(mot.length) : mot,
  );
}

/** Y a-t-il quelque chose à masquer ? Sert à décider d'un avertissement. */
export function contientGrossierete(texte: string): boolean {
  return masquerGrossieretes(texte) !== texte;
}
