import { DERIVE_MIN_M, doitRepublier } from '../geo';

/**
 * La règle qui décide si la file d'un conducteur suit sa voiture.
 *
 * Elle vaut d'être éprouvée pour une raison précise : c'est son ABSENCE qui a
 * laissé un conducteur figé au point où il avait appuyé sur GO, et un premier
 * point erroné le rester pour toujours.
 */
describe('doitRepublier', () => {
  const COLOBANE = { latitude: 14.7091, longitude: -17.4478 };

  it('publie le PREMIER point, quoi qu’il vaille — c’est lui qui corrige un GO faux', () => {
    expect(doitRepublier(null, COLOBANE)).toBe(true);
  });

  it('ne réécrit rien quand la voiture n’a pas bougé', () => {
    expect(doitRepublier(COLOBANE, COLOBANE)).toBe(false);
  });

  it('ne réécrit pas pour le bruit d’un point GPS à l’arrêt', () => {
    // Une trentaine de mètres : un feu rouge, pas un déplacement.
    const auFeu = { latitude: 14.7091 + 0.0003, longitude: -17.4478 };
    expect(doitRepublier(COLOBANE, auFeu)).toBe(false);
  });

  it('republie dès que la voiture a réellement roulé', () => {
    // Colobane → Mermoz, 3 km : bien au-delà du rayon de production.
    const mermoz = { latitude: 14.7074, longitude: -17.4744 };
    expect(doitRepublier(COLOBANE, mermoz)).toBe(true);
  });

  it('le seuil reste sous le rayon de production — sinon la file mentirait', () => {
    expect(DERIVE_MIN_M).toBeLessThan(3000);
  });
});
