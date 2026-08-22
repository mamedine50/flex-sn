import {
  COTE_MIN_PX,
  OCTETS_MIN,
  defautDeQualite,
} from '../qualiteImage';

describe('defautDeQualite', () => {
  it('laisse passer une photo de document ordinaire', () => {
    expect(defautDeQualite(3024, 4032, 420_000)).toBeNull();
  });

  it('refuse une image trop petite pour être lue une fois compressée', () => {
    expect(defautDeQualite(640, 480, 300_000)).toBe('trop_petite');
  });

  it('mesure le GRAND côté, pas la largeur — un document se photographie debout', () => {
    expect(defautDeQualite(700, 1400, 300_000)).toBeNull();
  });

  it('refuse une image sans détail — mur, plafond, doigt sur l’objectif', () => {
    expect(defautDeQualite(3024, 4032, 12_000)).toBe('sans_detail');
  });

  it('ne refuse PAS sur des dimensions inconnues : une absence n’est pas un défaut', () => {
    expect(defautDeQualite(undefined, undefined, 300_000)).toBeNull();
  });

  it('mais le poids reste vérifié même sans dimensions', () => {
    expect(defautDeQualite(undefined, undefined, 1_000)).toBe('sans_detail');
  });

  it('les seuils sont des bornes INCLUSIVES du côté qui passe', () => {
    expect(defautDeQualite(COTE_MIN_PX, COTE_MIN_PX, OCTETS_MIN)).toBeNull();
    expect(defautDeQualite(COTE_MIN_PX - 1, 100, OCTETS_MIN)).toBe('trop_petite');
    expect(defautDeQualite(2000, 2000, OCTETS_MIN - 1)).toBe('sans_detail');
  });

  it('la taille prime sur le poids : c’est le défaut le plus clair à expliquer', () => {
    expect(defautDeQualite(100, 100, 10)).toBe('trop_petite');
  });
});
