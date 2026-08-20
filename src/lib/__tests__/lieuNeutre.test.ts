import { lieuDepuisFavori, type FavoriBrut } from '../lieuNeutre';

/**
 * La règle tient en une phrase : rien de ce que le propriétaire a écrit ne doit
 * se retrouver dans ce qui part au serveur. Le conducteur voit
 * `destination_libelle` — on a flouté le point, on ne va pas nommer la porte.
 */
const domicile: FavoriBrut = {
  lat: 14.7091,
  lon: -17.4478,
  type: 'domicile',
  libelle: null,
  precision_texte: 'Immeuble bleu, 3e étage, porte gauche',
};

const chezMaSoeur: FavoriBrut = {
  lat: 14.72,
  lon: -17.47,
  type: 'autre',
  libelle: 'Chez ma sœur',
  precision_texte: 'Sonner deux fois',
};

describe('lieuDepuisFavori', () => {
  it('garde le point exact — c’est la base qui l’arrondit, pas nous', () => {
    const l = lieuDepuisFavori(domicile, 'Point sur la carte', 'Domicile');
    expect(l.lat).toBe(14.7091);
    expect(l.lon).toBe(-17.4478);
  });

  it('n’envoie JAMAIS le texte libre au serveur', () => {
    for (const f of [domicile, chezMaSoeur]) {
      const l = lieuDepuisFavori(f, 'Point sur la carte', 'Domicile');
      expect(l.libelle).not.toContain('Immeuble');
      expect(l.libelle).not.toContain('Sonner');
      expect(l.libelle).toBe('Point sur la carte');
    }
  });

  it('n’envoie JAMAIS le nom du favori au serveur', () => {
    const l = lieuDepuisFavori(chezMaSoeur, 'Point sur la carte', 'Chez ma sœur');
    expect(l.libelle).not.toContain('sœur');
    // Le nom reste visible chez son propriétaire, et seulement là.
    expect(l.prive).toBe('Chez ma sœur');
  });

  it('le nom affiché vient de l’appelant, pas du favori : « Domicile » se traduit', () => {
    expect(lieuDepuisFavori(domicile, 'Map point', 'Home').prive).toBe('Home');
  });
});
