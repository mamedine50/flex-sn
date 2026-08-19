import { supabase } from './supabase';

/**
 * Authentification par OTP téléphone.
 *
 * Le numéro est stocké au format international (`+221...`), c'est la contrainte
 * de `profiles.telephone` et c'est ce qu'attend le fournisseur SMS.
 */

/** Envoie le code. `shouldCreateUser` : un nouveau numéro crée son compte. */
export async function envoyerCode(telephone: string) {
  return supabase.auth.signInWithOtp({
    phone: telephone,
    options: { shouldCreateUser: true },
  });
}

/** Vérifie le code reçu par SMS et ouvre la session. */
export async function verifierCode(telephone: string, code: string) {
  return supabase.auth.verifyOtp({
    phone: telephone,
    token: code,
    type: 'sms',
  });
}

export async function seDeconnecter() {
  return supabase.auth.signOut();
}
