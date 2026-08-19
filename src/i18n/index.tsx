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
import { en } from './en';
import { fr } from './fr';
import {
  estDisponible,
  type CleTraduction,
  type Dictionnaire,
  type DictionnairePartiel,
  type Langue,
} from './types';
import { wo } from './wo';

export {
  LANGUES,
  LANGUES_DISPONIBLES,
  estDisponible,
  type CleTraduction,
  type Langue,
} from './types';

const CLE_STOCKAGE = 'flex.langue';

/**
 * `fr` par défaut, toujours. Aucune détection de locale : sur un téléphone
 * configuré en anglais — courant à Dakar — elle imposerait l'anglais à un
 * utilisateur francophone. La langue se choisit, elle ne se devine pas.
 */
export const LANGUE_PAR_DEFAUT: Langue = 'fr';

const dictionnaires: Record<Langue, Dictionnaire | DictionnairePartiel> = {
  fr,
  en,
  wo,
};

type Parametres = Record<string, string | number>;

function chercher(
  dictionnaire: Dictionnaire | DictionnairePartiel,
  cle: CleTraduction,
): string | undefined {
  const [groupe, nom] = cle.split('.') as [string, string];
  const valeurs = (dictionnaire as Record<string, Record<string, string>>)[
    groupe
  ];
  const valeur = valeurs?.[nom];
  return typeof valeur === 'string' && valeur.length > 0 ? valeur : undefined;
}

function interpoler(modele: string, parametres?: Parametres): string {
  if (!parametres) return modele;
  return modele.replace(/\{(\w+)\}/g, (entier, nom: string) => {
    const valeur = parametres[nom];
    return valeur === undefined ? entier : String(valeur);
  });
}

/**
 * Traduit une clé.
 *
 * Ordre : langue active → français → en développement `⛔ clé`, en production
 * une chaîne vide. La clé nue ne s'affiche jamais à un utilisateur.
 */
export function traduire(
  langue: Langue,
  cle: CleTraduction,
  parametres?: Parametres,
): string {
  const active = chercher(dictionnaires[langue], cle);
  if (active !== undefined) return interpoler(active, parametres);

  const secours = chercher(fr, cle);
  if (secours !== undefined) return interpoler(secours, parametres);

  if (__DEV__) {
    console.warn(`[i18n] clé absente : ${cle}`);
    return `⛔ ${cle}`;
  }
  return '';
}

type ContexteI18n = {
  langue: Langue;
  definirLangue: (langue: Langue) => void;
  t: (cle: CleTraduction, parametres?: Parametres) => string;
  /** `false` tant que la préférence stockée n'a pas été relue. */
  pret: boolean;
};

const Contexte = createContext<ContexteI18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(LANGUE_PAR_DEFAUT);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let vivant = true;
    void (async () => {
      const stockee = await lire(CLE_STOCKAGE);
      // Une langue stockée puis retirée du sélecteur retombe sur le défaut.
      if (vivant && estDisponible(stockee)) setLangue(stockee);
      if (vivant) setPret(true);
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const definirLangue = useCallback((suivante: Langue) => {
    setLangue(suivante);
    void ecrire(CLE_STOCKAGE, suivante);
  }, []);

  const t = useCallback(
    (cle: CleTraduction, parametres?: Parametres) =>
      traduire(langue, cle, parametres),
    [langue],
  );

  const valeur = useMemo<ContexteI18n>(
    () => ({ langue, definirLangue, t, pret }),
    [langue, definirLangue, t, pret],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useI18n(): ContexteI18n {
  const contexte = useContext(Contexte);
  if (!contexte) {
    throw new Error('useI18n doit être appelé sous <I18nProvider>.');
  }
  return contexte;
}

/** Raccourci : `const t = useT()` puis `t('accueil.ou')`. */
export function useT() {
  return useI18n().t;
}
