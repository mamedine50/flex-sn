import { lieuLePlusProche, RAYON_NOMMAGE_M, type Lieu } from '../lieuxOrdre';

const lieu = (nom: string, lat: number, lon: number): Lieu => ({
  code: nom,
  nom,
  alias: [],
  categorie: 'quartier',
  lat,
  lon,
});

// Trois quartiers dakarois réels, à leurs coordonnées approximatives.
const LIEUX = [
  lieu('Ouakam', 14.7167, -17.488),
  lieu('Mermoz', 14.7074, -17.4744),
  lieu('Plateau', 14.6688, -17.4383),
];

describe('lieuLePlusProche', () => {
  it('nomme un point posé au cœur d’un quartier', () => {
    expect(lieuLePlusProche(LIEUX, { lat: 14.7168, lon: -17.4881 })?.nom).toBe('Ouakam');
  });

  it('choisit le PLUS proche, pas le premier de la liste', () => {
    expect(lieuLePlusProche(LIEUX, { lat: 14.7075, lon: -17.4745 })?.nom).toBe('Mermoz');
  });

  it('ne nomme RIEN en plein océan — mieux vaut pas de nom qu’un faux', () => {
    expect(lieuLePlusProche(LIEUX, { lat: 14.5, lon: -17.9 })).toBeNull();
  });

  it('respecte le rayon : au-delà, le repère le plus proche égare', () => {
    // Un point à plus d'un kilomètre et demi de tout quartier connu. Hors du
    // rayon par défaut, il n'a pas de nom ; en élargissant, il en trouve un —
    // et c'est bien le PLUS proche, Ouakam, pas celui qu'on croyait de tête.
    const loin = { lat: 14.725, lon: -17.4744 };
    expect(lieuLePlusProche(LIEUX, loin)).toBeNull();
    expect(lieuLePlusProche(LIEUX, loin, 5000)?.nom).toBe('Ouakam');
  });

  it('supporte une liste vide', () => {
    expect(lieuLePlusProche([], { lat: 14.7, lon: -17.4 })).toBeNull();
  });

  it('le rayon par défaut est de 800 m — l’ordre de grandeur d’un quartier', () => {
    expect(RAYON_NOMMAGE_M).toBe(800);
  });
});
