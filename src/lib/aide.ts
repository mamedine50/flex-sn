import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

/**
 * « Écrivez-nous » — sans infrastructure.
 *
 * Pas de formulaire, pas de service tiers : on ouvre le client mail du
 * téléphone. C'est ce qui coûte le moins et marche partout, et ça laisse la
 * copie du message chez la personne, ce qu'aucun formulaire ne fait.
 *
 * LE CORPS PORTE LA VERSION ET LE RÔLE, discrètement, sous une ligne de
 * séparation. Sans ça, chaque échange commence par deux allers-retours pour
 * savoir quelle version tourne et si la personne écrivait comme passager ou
 * comme conducteur. Rien d'autre n'y est mis : ni identifiant, ni numéro, ni
 * position — un corps de message se transfère.
 *
 * SI AUCUN CLIENT MAIL N'EST CONFIGURÉ, `openURL` échoue et on rend `false`.
 * L'écran affiche alors l'adresse en clair, sélectionnable. Un bouton « Copier »
 * demanderait `expo-clipboard`, donc une dépendance native et une
 * reconstruction du client — un appui long sur un texte sélectionnable fait la
 * même chose, tout de suite.
 */
export const ADRESSE_AIDE = 'pharestudiosn@gmail.com';

export function corpsAide(conducteur: boolean): string {
  const version = Constants.expoConfig?.version ?? '?';
  const role = conducteur ? 'conducteur' : 'passager';
  return [
    '',
    '',
    '—',
    `Flex ${version} · ${Platform.OS} · compte ${role}`,
  ].join('\n');
}

/** Rend `false` si le téléphone n'a pas de client mail : l'écran prend le relais. */
export async function ouvrirAide(conducteur: boolean): Promise<boolean> {
  const url =
    `mailto:${ADRESSE_AIDE}` +
    `?subject=${encodeURIComponent('Flex — demande d’aide')}` +
    `&body=${encodeURIComponent(corpsAide(conducteur))}`;

  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
