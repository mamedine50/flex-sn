import { useColorScheme } from 'nativewind';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ecrire, lire } from '../lib/stockage';
import {
  radius,
  space,
  tokens,
  touch,
  type ColorToken,
  type ThemeName,
} from './tokens';

const CLE_STOCKAGE = 'flex.theme';

/** Ce que l'utilisateur a choisi — pas forcément le thème affiché. */
export const PREFERENCES = ['systeme', 'clair', 'sombre'] as const;

export type PreferenceTheme = (typeof PREFERENCES)[number];

function estPreference(valeur: unknown): valeur is PreferenceTheme {
  return (
    typeof valeur === 'string' &&
    (PREFERENCES as readonly string[]).includes(valeur)
  );
}

const versNativeWind = {
  systeme: 'system',
  clair: 'light',
  sombre: 'dark',
} as const;

/** Les jetons d'un thème. Les deux palettes ont exactement ces clés. */
export type Couleurs = Record<ColorToken, string>;

type ContexteTheme = {
  /** Le choix de l'utilisateur, persisté. */
  preference: PreferenceTheme;
  /** Le thème réellement affiché, système résolu. */
  theme: ThemeName;
  /** Les jetons du thème affiché. */
  couleurs: Couleurs;
  radius: typeof radius;
  space: typeof space;
  touch: typeof touch;
  definirPreference: (preference: PreferenceTheme) => void;
  /** Bascule clair ↔ sombre, et sort du suivi système. */
  basculer: () => void;
  /** `false` tant que la préférence stockée n'a pas été relue. */
  pret: boolean;
};

const Contexte = createContext<ContexteTheme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreference] = useState<PreferenceTheme>('systeme');
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      const stockee = await lire(CLE_STOCKAGE);
      if (vivant && estPreference(stockee)) setPreference(stockee);
      if (vivant) setPret(true);
    })();
    return () => {
      vivant = false;
    };
  }, []);

  // NativeWind bascule la classe `dark`, donc les variables CSS des jetons.
  useEffect(() => {
    setColorScheme(versNativeWind[preference]);
  }, [preference, setColorScheme]);

  const theme: ThemeName = colorScheme === 'dark' ? 'dark' : 'light';

  const definirPreference = useCallback((suivante: PreferenceTheme) => {
    setPreference(suivante);
    void ecrire(CLE_STOCKAGE, suivante);
  }, []);

  const basculer = useCallback(() => {
    definirPreference(theme === 'dark' ? 'clair' : 'sombre');
  }, [definirPreference, theme]);

  const valeur = useMemo<ContexteTheme>(
    () => ({
      preference,
      theme,
      couleurs: tokens[theme],
      radius,
      space,
      touch,
      definirPreference,
      basculer,
      pret,
    }),
    [preference, theme, definirPreference, basculer, pret],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

/**
 * Les jetons du thème actif.
 *
 * À n'utiliser que là où une classe NativeWind ne passe pas : style de carte,
 * barre d'état, composant natif. Dans un composant, `className` d'abord.
 */
export function useTheme(): ContexteTheme {
  const contexte = useContext(Contexte);
  if (!contexte) {
    throw new Error('useTheme doit être appelé sous <ThemeProvider>.');
  }
  return contexte;
}
