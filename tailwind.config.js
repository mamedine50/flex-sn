/**
 * Aucune couleur n'est déclarée ici. Tout vient de `src/theme/tokens.ts`.
 *
 * Chaque jeton devient :
 *   - une variable CSS `--flex-<jeton>`, posée en clair sur `:root` et en sombre
 *     sur `.dark:root` — c'est NativeWind qui bascule la classe ;
 *   - une couleur Tailwind du même nom, qui pointe sur cette variable.
 *
 * D'où `bg-bg`, `text-ink`, `text-moneyInk`, `bg-accFill text-onAcc`, sans jamais
 * écrire de variante `dark:` sur une couleur : la variable a déjà changé.
 */
const plugin = require('tailwindcss/plugin');
const { tokens, radius, space, touch } = require('./src/theme/tokens.ts');

const jetons = Object.keys(tokens.dark);

/** { '--flex-bg': '#0E1C2C', ... } pour une palette donnée. */
const variables = (palette) =>
  Object.fromEntries(jetons.map((nom) => [`--flex-${nom}`, palette[nom]]));

/** { bg: 'var(--flex-bg)', ... } */
const couleurs = Object.fromEntries(
  jetons.map((nom) => [nom, `var(--flex-${nom})`]),
);

/** L'échelle de 4 de tokens.ts, indexée par elle-même : `p-16` = 16 px. */
const espacements = Object.fromEntries(space.map((v) => [String(v), `${v}px`]));

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: couleurs,
      spacing: espacements,
      borderRadius: Object.fromEntries(
        Object.entries(radius).map(([nom, v]) => [nom, `${v}px`]),
      ),
      // `touch` plutôt que `min` : `min-h-min` existe déjà chez Tailwind, et
      // l'écraser rendrait une classe standard silencieusement fausse.
      minHeight: {
        touch: `${touch.min}px`,
        driving: `${touch.driving}px`,
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': variables(tokens.light),
        '.dark:root': variables(tokens.dark),
      });
    }),
  ],
};
