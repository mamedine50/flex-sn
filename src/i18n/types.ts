import type { fr } from './fr';

/** Le français fait foi : toute autre langue a exactement cette forme. */
export type Dictionnaire = {
  [G in keyof typeof fr]: { [K in keyof (typeof fr)[G]]: string };
};

/** Une langue en cours de traduction : mêmes groupes, clés facultatives. */
export type DictionnairePartiel = {
  [G in keyof Dictionnaire]?: Partial<Dictionnaire[G]>;
};

/** `'accueil.ou' | 'prix.montant' | …` — une faute de frappe ne compile pas. */
export type CleTraduction = {
  [G in keyof Dictionnaire & string]: `${G}.${keyof Dictionnaire[G] & string}`;
}[keyof Dictionnaire & string];

/** Toutes les langues que le code connaît, traduites ou non. */
export const LANGUES = ['fr', 'en', 'wo'] as const;

export type Langue = (typeof LANGUES)[number];

/**
 * Les langues réellement proposées dans le sélecteur.
 *
 * `wo` en est absent tant que `wo.ts` est vide : proposer le wolof pour n'afficher
 * que du français laisse l'utilisateur croire à une panne. Le repli sur le
 * français reste en place, il n'est simplement plus atteignable par un choix.
 *
 * Pour l'ouvrir : traduire `wo.ts`, puis ajouter `'wo'` ici. Le test
 * « une langue traduite est proposée » échoue tant que ce n'est pas fait.
 */
export const LANGUES_DISPONIBLES: readonly Langue[] = ['fr', 'en'];

export function estLangue(valeur: unknown): valeur is Langue {
  return (
    typeof valeur === 'string' && (LANGUES as readonly string[]).includes(valeur)
  );
}

export function estDisponible(valeur: unknown): valeur is Langue {
  return estLangue(valeur) && LANGUES_DISPONIBLES.includes(valeur);
}
