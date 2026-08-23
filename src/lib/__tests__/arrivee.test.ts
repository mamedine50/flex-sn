import { estArrive, RAYON_ARRIVEE_M } from '../geo';

/**
 * « Vous y êtes ». La règle qui met le bouton d'arrivée en avant.
 */
describe('estArrive', () => {
  const RENDEZ_VOUS = { latitude: 14.7091, longitude: -17.4478 };

  it('devant la porte, c’est arrivé', () => {
    // Une trentaine de mètres : la largeur d'une rue et un trottoir.
    expect(estArrive({ latitude: 14.7091 + 0.0003, longitude: -17.4478 }, RENDEZ_VOUS)).toBe(true);
  });

  it('au bout de la rue, ça ne l’est pas — le passager sortirait pour rien', () => {
    // Trois cents mètres.
    expect(estArrive({ latitude: 14.7091 + 0.0027, longitude: -17.4478 }, RENDEZ_VOUS)).toBe(false);
  });

  it('sans position, on n’annonce rien', () => {
    expect(estArrive(null, RENDEZ_VOUS)).toBe(false);
    expect(estArrive(RENDEZ_VOUS, null)).toBe(false);
  });

  it('le seuil reste au-dessus du bruit d’un GPS urbain', () => {
    // Un point se trompe couramment de 20 à 30 m entre les immeubles.
    expect(RAYON_ARRIVEE_M).toBeGreaterThanOrEqual(50);
  });
});
