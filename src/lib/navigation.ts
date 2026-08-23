import { Linking, Platform } from 'react-native';

/**
 * Le guidage jusqu'au client — sans une seule ligne facturée.
 *
 * ── POURQUOI ON NE TRACE PAS L'ITINÉRAIRE NOUS-MÊMES ───────────────────────
 * Un vrai tracé demande l'API Directions, facturée à l'appel, et la règle du
 * dépôt l'interdit. Ce n'est pas une privation : elle nous force vers la
 * meilleure solution, pas la moins bonne.
 *
 * On PASSE LA MAIN à l'application de cartes du téléphone. Le conducteur y
 * gagne le guidage vocal, le trafic en direct, les radars, la voix dans sa
 * langue — tout ce qu'on ne construira jamais. Nous, on n'y perd rien : Flex
 * n'a aucune valeur à ajouter entre un conducteur et une route qu'il connaît
 * mieux que nous.
 *
 * C'est aussi ce que font la plupart des applications de course. Celles qui
 * embarquent leur propre navigation le font pour capter le conducteur, pas
 * pour l'aider.
 *
 * ── LE SCHÉMA D'URL DÉPEND DU SYSTÈME ──────────────────────────────────────
 * iOS ouvre Plans, qui est toujours installé. Android demande la NAVIGATION
 * Google Maps directement — `google.navigation:` démarre le guidage au lieu de
 * poser un repère, ce qui économise deux appuis à quelqu'un qui a déjà démarré.
 *
 * Le repli `geo:` est le schéma standard d'Android : si Google Maps est absent,
 * le système propose ce qui est installé. On ne suppose jamais qu'une
 * application précise est là.
 */
export type Point = { latitude: number; longitude: number };

/** L'URL de guidage, sortie de la fonction pour être éprouvée sans téléphone. */
export function urlItineraire(
  point: Point,
  libelle: string | null,
  systeme: 'ios' | 'android',
): string {
  const lat = point.latitude;
  const lon = point.longitude;

  if (systeme === 'ios') {
    // `dirflg=d` : en voiture. Sans lui, Plans peut ouvrir en transports en
    // commun selon le dernier choix de l'utilisateur — inutile à un conducteur.
    const nom = libelle ? `&q=${encodeURIComponent(libelle)}` : '';
    return `http://maps.apple.com/?daddr=${lat},${lon}&dirflg=d${nom}`;
  }

  return `google.navigation:q=${lat},${lon}&mode=d`;
}

/** Le repli, quand la navigation directe n'est pas disponible. */
export function urlRepli(point: Point, libelle: string | null): string {
  const nom = libelle ? `(${encodeURIComponent(libelle)})` : '';
  return `geo:${point.latitude},${point.longitude}?q=${point.latitude},${point.longitude}${nom}`;
}

/**
 * Ouvre le guidage. Rend `false` si rien n'a pu s'ouvrir — l'appelant le dit
 * plutôt que de laisser un bouton qui ne fait rien.
 */
export async function ouvrirItineraire(
  point: Point,
  libelle: string | null,
): Promise<boolean> {
  const systeme = Platform.OS === 'ios' ? 'ios' : 'android';
  const url = urlItineraire(point, libelle, systeme);

  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return true;
    }
  } catch {
    // On tombe dans le repli plutôt que de remonter : l'échec d'un schéma
    // d'URL n'est pas une information pour le conducteur, c'en est une pour
    // nous, et le repli marche.
  }

  try {
    await Linking.openURL(urlRepli(point, libelle));
    return true;
  } catch {
    return false;
  }
}
