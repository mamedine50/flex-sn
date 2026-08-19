/**
 * Vérifie le contraste WCAG de tokens.ts dans les DEUX thèmes :
 *
 *   - `contrastPairs` — du texte sur un fond, seuil 4,5:1
 *   - `shapePairs`    — une forme porteuse d'information, seuil 3:1
 *
 *   pnpm tokens:check
 *
 * Aucun contournement : une paire sous le seuil se corrige dans tokens.ts, elle
 * ne se retire pas de la liste.
 */
import {
  contrastPairs,
  shapePairs,
  tokens,
  type ColorToken,
  type ThemeName,
} from '../src/theme/tokens.ts';

type Liste = {
  titre: string;
  seuil: number;
  paires: Array<[ColorToken, ColorToken]>;
  /** `sur` pour un texte, `contre` pour une forme — ce n'est pas le même geste. */
  liaison: string;
};

const listes: Liste[] = [
  { titre: 'texte', seuil: 4.5, paires: contrastPairs, liaison: 'sur' },
  { titre: 'formes', seuil: 3, paires: shapePairs, liaison: 'contre' },
];

function versCanaux(hex: string): [number, number, number] {
  const brut = hex.replace('#', '');
  const complet =
    brut.length === 3
      ? brut
          .split('')
          .map((c) => c + c)
          .join('')
      : brut;
  if (!/^[0-9a-fA-F]{6}$/.test(complet)) {
    throw new Error(`Couleur illisible : ${hex}`);
  }
  return [
    parseInt(complet.slice(0, 2), 16),
    parseInt(complet.slice(2, 4), 16),
    parseInt(complet.slice(4, 6), 16),
  ];
}

/** Luminance relative, WCAG 2.1. */
function luminance(hex: string): number {
  const [r, v, b] = versCanaux(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

function contraste(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [haut, bas] = la > lb ? [la, lb] : [lb, la];
  return (haut + 0.05) / (bas + 0.05);
}

const themes: ThemeName[] = ['light', 'dark'];
let echecs = 0;
let verifiees = 0;

for (const { titre, seuil, paires, liaison } of listes) {
  for (const theme of themes) {
    const palette = tokens[theme];
    console.log(
      `\n  ${theme === 'light' ? 'Clair' : 'Sombre'} — ${titre} (${seuil}:1)`,
    );

    for (const [avant, apres] of paires) {
      const ratio = contraste(palette[avant], palette[apres]);
      const passe = ratio >= seuil;
      verifiees += 1;
      if (!passe) echecs += 1;
      const paire = `${avant} ${liaison} ${apres}`.padEnd(28);
      console.log(
        `  ${passe ? '✓' : '✗'} ${paire} ${ratio.toFixed(2)}:1${passe ? '' : `  — sous ${seuil}:1`}`,
      );
    }
  }
}

if (echecs > 0) {
  console.error(
    `\n  ${echecs} paire(s) sous leur seuil. Corrigez src/theme/tokens.ts.\n`,
  );
  process.exit(1);
}

console.log(
  `\n  ${verifiees} paires vérifiées, toutes au-dessus de leur seuil.\n`,
);
