import { horsCouverture, RAYON_COUVERTURE_M } from '../couverture';

/**
 * On constate, on informe, on n'enferme personne dehors. Ces assertions gardent
 * le SEUIL, pas le comportement de l'écran : l'écran, lui, reste utilisable
 * partout, et c'est vérifié à la main depuis le Canada.
 */
describe('horsCouverture', () => {
  it('le Plateau, Ouakam, l’AIBD sont dans la zone', () => {
    expect(horsCouverture({ latitude: 14.6673, longitude: -17.438 })).toBe(false); // Plateau
    expect(horsCouverture({ latitude: 14.7247, longitude: -17.4851 })).toBe(false); // Ouakam
    expect(horsCouverture({ latitude: 14.6702, longitude: -17.0733 })).toBe(false); // AIBD
  });

  it('Thiès est déjà dehors : la V1 dessert la région de Dakar, pas le pays', () => {
    expect(horsCouverture({ latitude: 14.7886, longitude: -16.9246 })).toBe(true);
  });

  it('Montréal aussi — et l’application doit rester utilisable depuis là', () => {
    expect(horsCouverture({ latitude: 45.5019, longitude: -73.5674 })).toBe(true);
  });

  it('le rayon reste celui qu’on a écrit dans le README', () => {
    expect(RAYON_COUVERTURE_M).toBe(50_000);
  });
});
