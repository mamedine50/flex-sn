/**
 * Géométrie et estimations. Aucune dépendance : c'est du calcul, et un test doit
 * pouvoir le vérifier sans monter un client Supabase.
 */

/**
 * Vitesse moyenne retenue pour estimer un délai, en km/h. Dakar aux heures
 * ouvrables. C'est une ESTIMATION, montrée avant qu'on s'engage dessus.
 */
export const VITESSE_KMH = 18;

/** Un trajet routier à Dakar vaut environ 1,3× la distance à vol d'oiseau. */
export const FACTEUR_DETOUR = 1.3;

/** Distance à vol d'oiseau, en mètres. */
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Délai d'arrivée estimé, en minutes, jamais moins d'une. */
export function delaiEstimeMin(metres: number): number {
  const metresRoute = metres * FACTEUR_DETOUR;
  return Math.max(1, Math.round(((metresRoute / 1000) * 60) / VITESSE_KMH));
}

/** Faut-il émettre sa position ? Voir `src/lib/suivi.ts`. */
export function doitEmettre(statut: string | null | undefined): boolean {
  return (
    statut === 'en_route' ||
    statut === 'arrive' ||
    statut === 'commencee' ||
    statut === 'en_cours'
  );
}

/** Âge d'une position, en secondes. Jamais négatif, même si les horloges divergent. */
export function ageSecondes(majLe: number, maintenant: number): number {
  return Math.max(0, Math.round((maintenant - majLe) / 1000));
}

/** Le temps d'arrivée restant, sur la distance à vol d'oiseau. Jamais Directions. */
export function etaMinutes(
  conducteur: { latitude: number; longitude: number } | null,
  cible: { latitude: number; longitude: number } | null,
): number | null {
  if (!conducteur || !cible) return null;
  return delaiEstimeMin(distanceM(conducteur, cible));
}

/**
 * En deçà, on ne réécrit pas : un conducteur arrêté à un feu n'a pas bougé.
 * Cent mètres est aussi le bruit d'un point GPS en ville — écrire moins que ça,
 * c'est écrire du bruit.
 */
export const DERIVE_MIN_M = 100;

/**
 * Faut-il réécrire le point ? Sortie de la boucle pour être éprouvée : c'est la
 * règle qui décide si la file d'un conducteur suit sa voiture ou pas.
 */
export function doitRepublier(
  avant: { latitude: number; longitude: number } | null,
  maintenant: { latitude: number; longitude: number },
): boolean {
  // Le premier point passe toujours : c'est lui qui corrige un GO tiré sur une
  // position fausse.
  return avant === null || distanceM(avant, maintenant) >= DERIVE_MIN_M;
}

/**
 * À quelle distance du point de rendez-vous on considère qu'on y est.
 *
 * QUATRE-VINGTS MÈTRES, et le chiffre est un compromis assumé. Un point GPS en
 * ville se trompe couramment de vingt à trente mètres, entre les immeubles
 * parfois davantage. Plus serré, le conducteur serait devant la porte sans que
 * l'application le reconnaisse — et il chercherait le bouton en se demandant ce
 * qui cloche. Plus large, elle annoncerait son arrivée alors qu'il est encore
 * au bout de la rue, et c'est le passager qui sortirait pour rien.
 */
export const RAYON_ARRIVEE_M = 80;

/**
 * Le conducteur est-il arrivé ?
 *
 * Elle ne DÉCIDE rien toute seule : elle met le bouton en avant, elle ne
 * l'appuie pas. Laisser le GPS avancer la course à la place du conducteur, ce
 * serait faire démarrer une attente payante sur un point qui a sauté d'un
 * immeuble — et c'est le genre d'automatisme qu'on ne peut pas contester.
 */
export function estArrive(
  position: { latitude: number; longitude: number } | null,
  rendezVous: { latitude: number; longitude: number } | null,
): boolean {
  if (!position || !rendezVous) return false;
  return distanceM(position, rendezVous) <= RAYON_ARRIVEE_M;
}
