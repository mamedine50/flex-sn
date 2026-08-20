import { supabase } from './supabase';

/**
 * Authentification par OTP téléphone.
 *
 * Le numéro part au format E.164 — indicatif compris, sans espaces. C'est ce
 * qu'attend le fournisseur SMS, et c'est ce que `profiles.telephone` accepte
 * depuis `20260820210000_telephone_international.sql`.
 *
 * La mise en forme du numéro et le classement des erreurs vivent dans
 * `telephone.ts`, qui n'importe rien : ils se testent.
 */
export {
  cleErreurAuth,
  formaterNumero,
  numeroE164,
  numeroPlausible,
} from './telephone';

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
