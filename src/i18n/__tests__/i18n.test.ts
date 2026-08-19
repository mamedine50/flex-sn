import { fr } from '../fr';
import { en } from '../en';
import { wo } from '../wo';
import { traduire } from '../index';
import { LANGUES, LANGUES_DISPONIBLES, type CleTraduction } from '../types';

const groupes = Object.keys(fr) as (keyof typeof fr)[];

describe('dictionnaires', () => {
  it('anglais couvre exactement les clés du français', () => {
    for (const groupe of groupes) {
      expect(Object.keys(en[groupe]).sort()).toEqual(
        Object.keys(fr[groupe]).sort(),
      );
    }
  });

  it('wolof déclare les groupes sans inventer de chaîne', () => {
    expect(Object.keys(wo).sort()).toEqual([...groupes].sort());
    for (const groupe of groupes) {
      expect(Object.keys(wo[groupe] ?? {})).toHaveLength(0);
    }
  });
});

describe('sélecteur de langue', () => {
  it('ne propose pas le wolof tant que wo.ts est vide', () => {
    expect(LANGUES).toContain('wo');
    expect(LANGUES_DISPONIBLES).not.toContain('wo');
  });

  it('propose toute langue qui a au moins une traduction', () => {
    // Garde-fou : le jour où wo.ts se remplit, ce test échoue et force à
    // ajouter 'wo' à LANGUES_DISPONIBLES. Sans lui, la traduction resterait
    // écrite mais inatteignable.
    const dictionnaires = { fr, en, wo };
    for (const langue of LANGUES) {
      const traduite = Object.values(dictionnaires[langue]).some(
        (groupe) => Object.keys(groupe).length > 0,
      );
      if (traduite) expect(LANGUES_DISPONIBLES).toContain(langue);
    }
  });
});

describe('traduire', () => {
  it('rend le français par défaut', () => {
    expect(traduire('fr', 'accueil.ou')).toBe('Où allez-vous ?');
  });

  it('rend l’anglais quand il est choisi', () => {
    expect(traduire('en', 'accueil.ou')).toBe('Where are you going?');
  });

  it('retombe sur le français pour une langue non traduite', () => {
    // Le repli reste en place même si le wolof n'est plus proposé au choix.
    expect(traduire('wo', 'accueil.ou')).toBe('Où allez-vous ?');
  });

  it('interpole les paramètres', () => {
    expect(traduire('fr', 'offres.minutes', { n: 4 })).toBe('4 min');
  });

  it('rend « ⛔ clé » en développement pour une clé absente', () => {
    const avert = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(traduire('fr', 'accueil.inexistante' as CleTraduction)).toBe(
      '⛔ accueil.inexistante',
    );
    avert.mockRestore();
  });

  it('ne rend jamais la clé nue en production', () => {
    const dev = (globalThis as unknown as { __DEV__: boolean }).__DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    expect(traduire('fr', 'accueil.inexistante' as CleTraduction)).toBe('');
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
  });
});
