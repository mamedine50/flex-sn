const expo = require('eslint-config-expo/flat');

module.exports = [
  ...expo,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**'],
  },
  {
    rules: {
      // Aucun hex en dur hors de tokens.ts : la règle est tenue par la revue et
      // par `pnpm tokens:check`, pas par un lint qui ne verrait pas les alias.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/]",
          message:
            'Aucun hex en dur. Utilisez un jeton de src/theme/tokens.ts.',
        },
      ],
    },
  },
  {
    // tokens.ts est le seul fichier où une couleur s'écrit. Les scripts de
    // garde le lisent, ils ont donc le droit d'en manipuler.
    files: ['src/theme/tokens.ts', 'scripts/**'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/array-type': 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{ts,tsx}', 'jest.setup.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        require: 'readonly',
      },
    },
  },
];
