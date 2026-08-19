/**
 * Jetons de couleur Flex.
 *
 * Règle absolue : un jeton de REMPLISSAGE n'est jamais un jeton d'ENCRE.
 *   - `accFill` remplit une surface, on écrit dessus avec `onAcc`
 *   - `accInk`  écrit du texte sur le fond ou une carte
 *
 * L'ambre appartient aux montants. Un statut ne s'écrit jamais en ambre.
 *
 * `shapeOutline` n'est ni l'un ni l'autre : c'est le contour de 2 px que reçoit
 * tout aplat porteur d'information posé sur une carte ou une surface claire.
 */

export type ThemeName = 'dark' | 'light';

export const tokens = {
  dark: {
    bg: '#0E1C2C',
    card: '#12253A',
    card2: '#1A3049',
    line: '#1E3752',

    ink: '#F1F6FA',
    muted: '#8CA3B8',

    accFill: '#D6F9EB', // fond de bouton, pastille, tracé de carte
    onAcc: '#0E1C2C', // texte posé sur accFill
    accInk: '#9FE8CE', // texte et icônes accent

    moneyFill: '#F5A524', // point d'arrivée, badge — jamais de texte
    onMoney: '#2A1A02',
    moneyInk: '#FBBF24', // TOUS les montants

    // Contour des aplats. Même valeur dans les deux thèmes : il se pose SUR un
    // aplat clair (ambre, vert accent), jamais sur la page. En sombre, l'encre
    // du thème serait un contour presque blanc sur un aplat presque blanc.
    shapeOutline: '#0E1C2C',

    ok: '#34D399',
    onOk: '#04241A',
    danger: '#FF7A7A',

    map: '#132A40',
    road: '#1E4160',
    water: '#0D2136',
    block: '#183751',
  },

  light: {
    bg: '#F8FAFC',
    card: '#FFFFFF',
    card2: '#EEF3F7',
    line: '#E2E9F0',

    ink: '#0E1C2C',
    muted: '#5B7186',

    // #D6F9EB est illisible sur fond clair (≈1,06:1) — il ne sert PAS ici.
    // Le vert du bouton est choisi sur son contraste contre la PAGE, pas contre
    // son propre texte : sur #F8FAFC, #0FA37F devient une forme molle et la
    // CTA disparaît en plein soleil. Un bouton se voit comme forme d'abord.
    accFill: '#0B7A5F',
    onAcc: '#FFFFFF',
    // Volontairement distinct d'accFill : deux jetons identiques brouilleraient
    // la règle remplissage/encre que ce fichier existe pour enseigner.
    accInk: '#0A6B53',

    moneyFill: '#F5A524',
    onMoney: '#2A1A02',
    moneyInk: '#8A5A05',

    // Contour des aplats. Même valeur dans les deux thèmes : il se pose SUR un
    // aplat clair (ambre, vert accent), jamais sur la page. En sombre, l'encre
    // du thème serait un contour presque blanc sur un aplat presque blanc.
    shapeOutline: '#0E1C2C',

    ok: '#0B7A55',
    onOk: '#FFFFFF',
    danger: '#C2352B',

    map: '#E3EAF1',
    road: '#FFFFFF',
    water: '#CFDCE9',
    block: '#D6E0EA',
  },
} as const;

export type ColorToken = keyof typeof tokens.dark;

/** Paires vérifiées par `pnpm tokens:check` — doivent toutes tenir 4,5:1. */
export const contrastPairs: Array<[ColorToken, ColorToken]> = [
  ['ink', 'bg'],
  ['ink', 'card'],
  ['ink', 'card2'],
  ['muted', 'bg'],
  ['muted', 'card'],
  ['accInk', 'bg'],
  ['accInk', 'card'],
  ['moneyInk', 'bg'],
  ['moneyInk', 'card'],
  ['onAcc', 'accFill'],
  ['onOk', 'ok'],
  ['onMoney', 'moneyFill'],
  ['danger', 'bg'],
  ['danger', 'card'],
];

/**
 * Formes vérifiées par `pnpm tokens:check` — seuil 3:1, pas 4,5:1.
 *
 * Une forme n'est pas un texte : WCAG demande 3:1 pour un élément graphique
 * porteur d'information. Forcer 4,5:1 ici assombrirait des couleurs qui n'en
 * ont pas besoin.
 *
 * N'y entrent que les formes qui PORTENT une information. Ni bordures ni
 * séparateurs : ils n'en portent aucune, ils échoueraient tous, et la garde
 * mourrait de ses exceptions.
 *
 * `moneyFill` sur un fond clair n'y figure pas : à 1,95:1 sur `bg` clair il
 * échouerait, et l'assombrir tuerait l'ambre — la couleur de l'argent doit
 * rester reconnaissable. C'est son contour qui contraste, pas son aplat.
 */
export const shapePairs: Array<[ColorToken, ColorToken]> = [
  ['accFill', 'bg'],
  ['accFill', 'card'],
  ['ok', 'bg'],
  ['ok', 'card'],
  ['danger', 'bg'],
  ['danger', 'card'],
  ['shapeOutline', 'moneyFill'],
  ['shapeOutline', 'accFill'],
];

export const radius = {
  field: 16,
  card: 20,
  sheet: 24,
  button: 16,
  pill: 999,
} as const;

/** Échelle de 4. Rien entre les valeurs. */
export const space = [4, 8, 12, 16, 24, 32, 48] as const;

/** Hauteur minimale d'une zone tactile. 56 pour toute action faite au volant. */
export const touch = { min: 48, driving: 56 } as const;
