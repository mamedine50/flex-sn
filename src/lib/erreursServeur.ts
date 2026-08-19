import type { PostgrestError } from '@supabase/supabase-js';

import type { CleTraduction } from '../i18n';

/**
 * Les erreurs du serveur portent un code court et stable — `prix_hors_bornes`,
 * `demande_expiree` — jamais une phrase. La phrase est ici, dans `src/i18n`, et
 * elle se traduit.
 *
 * Un code inconnu retombe sur `erreurs.inconnue` : on ne montre JAMAIS le
 * message brut de Postgres à un utilisateur. Il est en anglais, il parle de
 * relations et de contraintes, et il fuite la structure de la base.
 */
const CORRESPONDANCE: Record<string, CleTraduction> = {
  non_authentifie: 'erreurs.nonAuthentifie',
  profil_absent: 'erreurs.profilAbsent',
  prix_hors_bornes: 'erreurs.prixHorsBornes',
  prix_non_multiple_de_100: 'erreurs.prixNonMultipleDe100',
  demande_deja_ouverte: 'erreurs.demandeDejaOuverte',
  demande_expiree: 'erreurs.demandeExpiree',
  demande_verrouillee: 'erreurs.dejaVerrouillee',
  conducteur_indisponible: 'erreurs.dejaVerrouillee',
};

export function cleErreur(erreur: PostgrestError | Error | null): CleTraduction {
  if (!erreur) return 'erreurs.inconnue';

  const message = erreur.message ?? '';
  const trouvee = CORRESPONDANCE[message.trim()];
  if (trouvee) return trouvee;

  // Panne de réseau : le client Supabase remonte un échec de `fetch`.
  if (/network|fetch|timeout/i.test(message)) return 'erreurs.reseau';

  return 'erreurs.inconnue';
}
