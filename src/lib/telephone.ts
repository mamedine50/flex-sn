import type { AuthError } from '@supabase/supabase-js';

import type { CleTraduction } from '../i18n';

/**
 * Le numéro de téléphone, et le classement des erreurs d'authentification.
 *
 * Ce module est PUR : il n'importe pas le client Supabase. C'est ce qui le rend
 * testable — `src/lib/supabase.ts` échoue au chargement sans variables
 * d'environnement, et un test n'en a pas.
 */

/** Assemble un E.164 à partir de l'indicatif et du numéro national saisis. */
export function numeroE164(indicatif: string, national: string): string {
  const i = indicatif.replace(/[^0-9]/g, '');
  const n = national.replace(/[^0-9]/g, '');
  return `+${i}${n}`;
}

/**
 * Longueur plausible, pas validité.
 *
 * On ne connaît pas les plans de numérotation du monde entier, et une
 * validation trop stricte refuserait un numéro réel. C'est le fournisseur SMS
 * qui tranche ; ici on évite juste d'envoyer un formulaire à moitié rempli.
 */
export function numeroPlausible(indicatif: string, national: string): boolean {
  const i = indicatif.replace(/[^0-9]/g, '');
  const n = national.replace(/[^0-9]/g, '');
  return i.length >= 1 && i.length <= 3 && n.length >= 6 && n.length <= 14;
}

/**
 * Met le numéro en forme pour être RELU, pas pour être joli.
 *
 * Groupé par deux au Sénégal — 77 12 34 56 7, c'est ainsi qu'on le dicte ici.
 * Ailleurs, on laisse les chiffres tels quels : on ne connaît pas la convention
 * de chaque pays, et en inventer une rend le numéro plus dur à vérifier.
 *
 * Espaces INSÉCABLES : un numéro coupé en fin de ligne ne se relit plus.
 */
export function formaterNumero(indicatif: string, national: string): string {
  const i = indicatif.replace(/[^0-9]/g, '');
  const n = national.replace(/[^0-9]/g, '');
  if (i !== '221') return `+${i}\u00a0${n}`;
  return `+${i}\u00a0${n.replace(/(.{2})/g, '$1\u00a0').trim()}`;
}

/**
 * Traduit une erreur d'authentification.
 *
 * GoTrue ne parle pas le code court des fonctions Postgres : il rend un `code`
 * quand il en a un, et une phrase en anglais sinon. On ne montre jamais cette
 * phrase — elle parle de « providers » et de « tokens ».
 */
export function cleErreurAuth(erreur: AuthError | null): CleTraduction {
  if (!erreur) return 'erreurs.inconnue';

  const code = erreur.code ?? '';
  const message = erreur.message ?? '';

  /*
   * L'ORDRE COMPTE, et il a déjà coûté une fausse piste.
   *
   * Toute erreur de livraison Twilio arrive sous la forme « Error sending
   * confirmation OTP to provider: ... ». Filtrer sur le mot « provider » range
   * donc un refus de région dans « fournisseur non branché » — et l'écran
   * conseille d'aller voir ailleurs alors que le fournisseur marche très bien.
   * Les causes précises passent AVANT les causes génériques.
   */

  // Twilio 21408 : le pays n'est pas ouvert dans les Geo Permissions. Le
  // fournisseur est branché, c'est la destination qui est fermée.
  if (/region indicated by the .To. number|errors\/21408/i.test(message)) {
    return 'erreurs.smsPaysFerme';
  }

  if (code === 'otp_expired' || /expired/i.test(message)) return 'erreurs.codeExpire';

  // Fournisseur réellement absent : GoTrue le dit avant même de sortir chez
  // Twilio, donc sans « to provider » dans la phrase.
  if (
    code === 'otp_disabled' ||
    /unsupported phone provider|phone (provider|signups?)[^:]*(disabled|not enabled)/i.test(
      message,
    )
  ) {
    return 'erreurs.smsIndisponible';
  }

  if (code.includes('rate_limit') || /security purposes|rate limit/i.test(message)) {
    return 'erreurs.tropDeTentatives';
  }

  // Tout autre échec d'ENVOI : le code n'est pas parti, mais on ne sait pas
  // pourquoi. On le dit comme ça plutôt que d'inventer une cause.
  if (code === 'sms_send_failed') return 'erreurs.smsEchecEnvoi';

  if (/invalid.*(token|otp|code)/i.test(message)) return 'erreurs.codeInvalide';
  if (code === 'validation_failed' || /phone/i.test(message)) return 'erreurs.numeroInvalide';
  if (/network|fetch|timeout/i.test(message)) return 'erreurs.reseau';

  return 'erreurs.inconnue';
}
