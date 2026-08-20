import { distanceM } from './geo';

/**
 * La zone servie, et ce qu'on en dit.
 *
 * On CONSTATE, on informe une fois, et on n'enferme personne dehors. Pas de
 * question « êtes-vous à Dakar ? », pas de blocage : quelqu'un qui prépare un
 * trajet depuis l'étranger, ou qui teste depuis le Canada, doit pouvoir tout
 * ouvrir. Le jour où une deuxième ville s'ajoute, c'est cette liste qui change,
 * pas les écrans.
 */
export const CENTRES_SERVIS = [
  { nom: 'Dakar', lat: 14.6928, lon: -17.4467 },
] as const;

/** Au-delà, on prévient. 50 km couvre toute la région, y compris l'AIBD. */
export const RAYON_COUVERTURE_M = 50_000;

export function horsCouverture(position: { latitude: number; longitude: number }): boolean {
  return CENTRES_SERVIS.every(
    (c) =>
      distanceM(position, { latitude: c.lat, longitude: c.lon }) > RAYON_COUVERTURE_M,
  );
}
