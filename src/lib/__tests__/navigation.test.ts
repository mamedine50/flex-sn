import { urlItineraire, urlRepli } from '../navigation';

/**
 * Les URL de guidage, éprouvées sans téléphone.
 *
 * Ce qui casse en silence ici, c'est un paramètre oublié : sans `dirflg=d`,
 * Plans peut ouvrir en transports en commun ; sans `mode=d`, Google Maps pose
 * un repère au lieu de démarrer le guidage. Dans les deux cas le bouton a l'air
 * de marcher.
 */
describe('urlItineraire', () => {
  const COLOBANE = { latitude: 14.7091, longitude: -17.4478 };

  it('iOS ouvre Plans EN VOITURE — sans dirflg, ce serait peut-être en bus', () => {
    const url = urlItineraire(COLOBANE, null, 'ios');
    expect(url).toContain('maps.apple.com');
    expect(url).toContain('daddr=14.7091,-17.4478');
    expect(url).toContain('dirflg=d');
  });

  it('Android démarre le GUIDAGE, il ne pose pas un repère', () => {
    const url = urlItineraire(COLOBANE, null, 'android');
    expect(url.startsWith('google.navigation:')).toBe(true);
    expect(url).toContain('mode=d');
  });

  it('le libellé est encodé — « Rue 10 x Corniche » casserait l’URL', () => {
    const url = urlItineraire(COLOBANE, 'Rue 10 x Corniche', 'ios');
    expect(url).not.toContain(' ');
    expect(url).toContain('Rue%2010%20x%20Corniche');
  });

  it('le repli reste le schéma standard, pour un téléphone sans Google Maps', () => {
    expect(urlRepli(COLOBANE, null)).toBe('geo:14.7091,-17.4478?q=14.7091,-17.4478');
  });
});
