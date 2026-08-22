import { heure24 } from '../format';

/**
 * Vingt-quatre heures dans toutes les langues — règle du dépôt. Ce test existe
 * surtout pour empêcher un retour à `toLocaleTimeString`, qui rendrait
 * « 7:04 PM » sur un appareil réglé en anglais.
 */
describe('heure24', () => {
  it('formate sur deux chiffres, séparés par deux-points', () => {
    const midi = new Date(2026, 7, 22, 9, 5).toISOString();
    expect(heure24(midi)).toBe('09:05');
  });

  it('ne bascule jamais en 12 h — 19 h reste 19', () => {
    const soir = new Date(2026, 7, 22, 19, 4).toISOString();
    expect(heure24(soir)).toBe('19:04');
  });

  it('minuit s’écrit 00:00, pas 12:00', () => {
    const minuit = new Date(2026, 7, 22, 0, 0).toISOString();
    expect(heure24(minuit)).toBe('00:00');
  });

  it('une date illisible ne fait pas tomber le fil', () => {
    expect(heure24('pas une date')).toBe('');
  });
});
