import { chercherLieux } from '../lieuxOrdre';
import { communeCorrespond, normaliser } from '../recherche';

/** La forme minimale que la recherche compare — pas besoin du reste. */
type Commune = { code: string; nom: string; region: string; lat: number; lon: number; alias: string[] };

const sicap: Commune = {
  code: 'dk-sicap',
  nom: 'Sicap-Liberté',
  region: 'Dakar',
  lat: 14.713,
  lon: -17.463,
  alias: ['SICAP', 'Baobab', 'Liberte'],
};

const grandYoff: Commune = {
  code: 'dk-grand-yoff',
  nom: 'Grand Yoff',
  region: 'Dakar',
  lat: 14.735,
  lon: -17.46,
  alias: ['Zone de captage'],
};

describe('normaliser', () => {
  it('retire les accents', () => {
    expect(normaliser('Sicap-Liberté')).toBe('sicap liberte');
    expect(normaliser('Gueule Tapée–Fass')).toBe('gueule tapee fass');
  });

  it('ramène tirets et casse à des espaces minuscules', () => {
    expect(normaliser('GRAND-YOFF')).toBe('grand yoff');
    expect(normaliser('  Point   E  ')).toBe('point e');
  });
});

describe('communeCorrespond', () => {
  it('trouve par le nom, quelle que soit la casse ou les accents', () => {
    expect(communeCorrespond(sicap, 'liberte')).toBe(true);
    expect(communeCorrespond(sicap, 'LIBERTÉ')).toBe(true);
    expect(communeCorrespond(sicap, 'sicap liberté')).toBe(true);
  });

  it('trouve par un nom d’usage — personne ne dit « Sicap-Liberté »', () => {
    expect(communeCorrespond(sicap, 'baobab')).toBe(true);
    expect(communeCorrespond(sicap, 'SICAP')).toBe(true);
  });

  it('« grand yoff » trouve « Grand-Yoff »', () => {
    expect(communeCorrespond(grandYoff, 'grand yoff')).toBe(true);
    expect(communeCorrespond({ ...grandYoff, nom: 'Grand-Yoff' }, 'grand yoff')).toBe(true);
  });

  it('ne trouve pas ce qui ne correspond pas', () => {
    expect(communeCorrespond(sicap, 'touba')).toBe(false);
  });

  it('une recherche vide laisse tout passer', () => {
    expect(communeCorrespond(sicap, '   ')).toBe(true);
  });
});

describe('ordre des résultats', () => {
  it('classe ce qui SITUE avant les points de repère', () => {
    const trouves = chercherLieux(
      [
        { code: 'h', nom: 'Yoff Beach Hotel', alias: [], categorie: 'hotel', lat: 0, lon: 0 },
        { code: 'q', nom: 'Yoff', alias: [], categorie: 'quartier', lat: 0, lon: 0 },
        { code: 'a', nom: 'Yoff Tonghor', alias: [], categorie: 'arret', lat: 0, lon: 0 },
      ],
      'yoff',
    );
    // Quelqu'un qui tape « yoff » cherche le quartier, pas l'hôtel.
    expect(trouves.map((l) => l.code)).toEqual(['q', 'a', 'h']);
  });
});
