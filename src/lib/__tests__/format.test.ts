import {
  arrondirAuPas,
  DEVISE,
  ESPACE_INSECABLE,
  formatXof,
  separerMilliers,
} from '../format';

describe('formatXof', () => {
  it('rend « 2 500 FCFA »', () => {
    expect(formatXof(2500)).toBe(`2${ESPACE_INSECABLE}500${ESPACE_INSECABLE}FCFA`);
  });

  it('sépare par une espace insécable, jamais par une virgule ni une espace ordinaire', () => {
    const rendu = formatXof(1234567);
    expect(rendu).toBe(
      `1${ESPACE_INSECABLE}234${ESPACE_INSECABLE}567${ESPACE_INSECABLE}${DEVISE}`,
    );
    expect(rendu).not.toContain(',');
    expect(rendu).not.toContain(' '); // espace ordinaire U+0020
  });

  it('laisse les montants sous mille intacts', () => {
    expect(formatXof(0)).toBe(`0${ESPACE_INSECABLE}FCFA`);
    expect(formatXof(100)).toBe(`100${ESPACE_INSECABLE}FCFA`);
    expect(formatXof(999)).toBe(`999${ESPACE_INSECABLE}FCFA`);
  });

  it('groupe par trois à partir de la droite', () => {
    expect(separerMilliers(1000)).toBe(`1${ESPACE_INSECABLE}000`);
    expect(separerMilliers(10000)).toBe(`10${ESPACE_INSECABLE}000`);
    expect(separerMilliers(100000)).toBe(`100${ESPACE_INSECABLE}000`);
    expect(separerMilliers(1000000)).toBe(
      `1${ESPACE_INSECABLE}000${ESPACE_INSECABLE}000`,
    );
  });

  it('garde le signe devant un montant négatif', () => {
    expect(formatXof(-2500)).toBe(
      `-2${ESPACE_INSECABLE}500${ESPACE_INSECABLE}FCFA`,
    );
  });

  it('refuse un flottant ou une valeur non finie', () => {
    expect(() => formatXof(2500.5)).toThrow();
    expect(() => formatXof(Number.NaN)).toThrow();
    expect(() => formatXof(Number.POSITIVE_INFINITY)).toThrow();
  });

  it('rend le même texte quelle que soit la locale du terminal', () => {
    const attendu = formatXof(2500);
    for (const locale of ['fr-FR', 'en-US', 'wo-SN']) {
      // formatXof n'utilise aucune API dépendante de la locale.
      expect(formatXof(2500)).toBe(attendu);
      expect(locale).toBeTruthy();
    }
  });
});

describe('arrondirAuPas', () => {
  it('arrondit au pas de 100 F', () => {
    expect(arrondirAuPas(2540)).toBe(2500);
    expect(arrondirAuPas(2560)).toBe(2600);
    expect(arrondirAuPas(2500)).toBe(2500);
  });
});
