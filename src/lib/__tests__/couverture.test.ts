import { SENEGAL, horsZone } from '../couverture';

/**
 * On éprouve `horsZone`, pas `horsCouverture` : l'interrupteur est lu à la
 * compilation, donc figé dans le paquet de test. Ce qui doit être prouvé, c'est
 * la GÉOMÉTRIE — l'interrupteur, lui, est une ligne qu'on relit.
 */
const point = (latitude: number, longitude: number) => ({ latitude, longitude });

describe('horsZone — le Sénégal', () => {
  it('Dakar est dedans', () => {
    expect(horsZone(point(14.6928, -17.4467), SENEGAL)).toBe(false);
  });

  it('Ziguinchor, tout au sud, est dedans', () => {
    expect(horsZone(point(12.5665, -16.2719), SENEGAL)).toBe(false);
  });

  it('Saint-Louis, tout au nord, est dedans', () => {
    expect(horsZone(point(16.0179, -16.4896), SENEGAL)).toBe(false);
  });

  it('Kédougou, tout à l’est, est dedans — un rayon depuis Dakar l’aurait exclue', () => {
    expect(horsZone(point(12.5556, -12.1806), SENEGAL)).toBe(false);
  });

  it('Gatineau est DEHORS — c’est le cas qui motive l’interrupteur', () => {
    expect(horsZone(point(45.4765, -75.7013), SENEGAL)).toBe(true);
  });

  it('Paris est dehors', () => {
    expect(horsZone(point(48.8566, 2.3522), SENEGAL)).toBe(true);
  });

  it('Abidjan est dehors — un voisin proche reste dehors', () => {
    expect(horsZone(point(5.3599, -4.0083), SENEGAL)).toBe(true);
  });

  it('les bornes sont INCLUSIVES : un point sur l’arête est dedans', () => {
    expect(horsZone(point(SENEGAL.latMin, SENEGAL.lonMin), SENEGAL)).toBe(false);
    expect(horsZone(point(SENEGAL.latMax, SENEGAL.lonMax), SENEGAL)).toBe(false);
  });

  it('un cheveu au-delà, et on est dehors', () => {
    expect(horsZone(point(SENEGAL.latMin - 0.001, -16), SENEGAL)).toBe(true);
    expect(horsZone(point(14, SENEGAL.lonMax + 0.001), SENEGAL)).toBe(true);
  });
});
