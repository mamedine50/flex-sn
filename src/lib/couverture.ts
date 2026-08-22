/**
 * La zone servie — et l'interrupteur qui la lève pour les essais.
 *
 * ================================================== UN SEUL POINT DE VÉRITÉ
 * Tout le comportement géographique passe par ce fichier : le bandeau de
 * l'accueil et le verrou du bouton GO l'appellent tous les deux. Il n'y a
 * aucune coordonnée d'essai ailleurs dans le code, et c'est la condition pour
 * qu'on puisse revenir au mode Sénégal en changeant UNE valeur, sans nettoyage
 * et sans risque d'en oublier une.
 *
 * ============================================================ L'INTERRUPTEUR
 * `EXPO_PUBLIC_ZONE_TEST=1` lève toute restriction : l'application fonctionne
 * partout, la position réelle de l'appareil est acceptée où qu'il soit, le
 * bandeau ne sort pas et le bouton GO n'est pas verrouillé. C'est ce qui permet
 * de jouer une course entière entre deux téléphones à Gatineau.
 *
 * Absent ou à autre chose que `1` : mode production, restreint au Sénégal.
 *
 * La valeur est lue À LA COMPILATION — `process.env.EXPO_PUBLIC_*` est remplacé
 * par sa valeur dans le paquet. Elle ne se change donc pas depuis l'application,
 * et un build de production ne peut pas être basculé en mode test par mégarde.
 * C'est une propriété qu'on veut : l'interrupteur vit dans le build, pas dans un
 * réglage qu'un utilisateur pourrait trouver.
 */
export const ZONE_TEST = process.env.EXPO_PUBLIC_ZONE_TEST === '1';

/**
 * Le Sénégal, en boîte englobante.
 *
 * POURQUOI UNE BOÎTE ET PAS UN RAYON. Le pays fait 700 km d'est en ouest et
 * n'est pas rond : un rayon depuis Dakar assez grand pour couvrir Kédougou
 * couvrirait aussi la moitié de la Mauritanie et du Mali. Une boîte suit la
 * forme réelle de beaucoup plus près.
 *
 * ELLE DÉBORDE, ET C'EST ASSUMÉ. Une boîte englobante inclut des bouts de
 * Gambie, de Mauritanie, du Mali et de Guinée. On préfère l'erreur de ce
 * côté-là : refuser une course à quelqu'un qui est réellement au Sénégal coûte
 * un client ; l'accepter à quelqu'un qui est à un kilomètre de la frontière ne
 * coûte rien, il n'y aura de toute façon aucun conducteur.
 *
 * Pour resserrer plus tard — sur Dakar seul, ou sur des polygones réels — c'est
 * cette constante qui change, et rien d'autre.
 */
export const SENEGAL = {
  nom: 'Sénégal',
  latMin: 12.25, // frontière sud, Casamance
  latMax: 16.70, // frontière nord, vallée du fleuve
  lonMin: -17.6, // pointe des Almadies
  lonMax: -11.3, // frontière du Mali
} as const;

export type Zone = typeof SENEGAL;

/** Pur, testable, sans réglage : dit si un point sort d'une boîte donnée. */
export function horsZone(
  position: { latitude: number; longitude: number },
  zone: Zone,
): boolean {
  return (
    position.latitude < zone.latMin ||
    position.latitude > zone.latMax ||
    position.longitude < zone.lonMin ||
    position.longitude > zone.lonMax
  );
}

/**
 * La question que posent les écrans.
 *
 * En mode test elle répond toujours « non » — et c'est le SEUL endroit où
 * l'interrupteur agit.
 */
export function horsCouverture(position: {
  latitude: number;
  longitude: number;
}): boolean {
  if (ZONE_TEST) return false;
  return horsZone(position, SENEGAL);
}
