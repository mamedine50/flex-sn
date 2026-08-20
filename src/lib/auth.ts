import type { AuthError } from '@supabase/supabase-js';

import type { CleTraduction } from '../i18n';
import { supabase } from './supabase';

/**
 * Authentification par OTP téléphone.
 *
 * Le numéro part au format E.164 — indicatif compris, sans espaces. C'est ce
 * qu'attend le fournisseur SMS, et c'est ce que `profiles.telephone` accepte
 * depuis `20260820210000_telephone_international.sql`.
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

/** Espace les chiffres par deux, à partir de la fin : plus facile à relire. */
export function formaterNumero(indicatif: string, national: string): string {
  const n = national.replace(/[^0-9]/g, '');
  const groupes = n.replace(/(.{2})/g, '$1 ').trim();
  return `+${indicatif.replace(/[^0-9]/g, '')} ${groupes}`;
}

/** Envoie le code. `shouldCreateUser` : un nouveau numéro crée son compte. */
export async function envoyerCode(telephone: string) {
  return supabase.auth.signInWithOtp({
    phone: telephone,
    options: { shouldCreateUser: true },
  });
}

/** Vérifie le code reçu par SMS et ouvre la session. */
export async function verifierCode(telephone: string, code: string) {
  return supabase.auth.verifyOtp({ phone: telephone, token: code, type: 'sms' });
}

export async function seDeconnecter() {
  return supabase.auth.signOut();
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

  if (code === 'otp_expired' || /expired/i.test(message)) return 'erreurs.codeExpire';
  if (code === 'otp_disabled' || /provider|not enabled|unsupported/i.test(message)) {
    return 'erreurs.smsIndisponible';
  }
  if (code.includes('rate_limit') || /security purposes|rate limit/i.test(message)) {
    return 'erreurs.tropDeTentatives';
  }
  if (/invalid.*(token|otp|code)/i.test(message)) return 'erreurs.codeInvalide';
  if (code === 'validation_failed' || /phone/i.test(message)) return 'erreurs.numeroInvalide';
  if (/network|fetch|timeout/i.test(message)) return 'erreurs.reseau';

  return 'erreurs.inconnue';
}
