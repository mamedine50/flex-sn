import { supabase } from './supabase';

/**
 * Session de test, sans OTP — DÉVELOPPEMENT UNIQUEMENT.
 *
 * L'authentification de production est en OTP téléphone, et Supabase exige un
 * fournisseur SMS qui n'est pas encore branché. Sans échappatoire, aucun écran
 * qui écrit ne serait constructible ni testable avant que Twilio existe : on
 * bâtirait sur des constantes, et on découvrirait les vrais problèmes à la fin.
 *
 * Le compte est créé côté base, pas ici : le client n'a que la clé anonyme et ne
 * peut pas confirmer une adresse. S'il manque, la marche à suivre est dans
 * `docs/migrations-repair.md` et le compte rendu de l'étape 3.
 *
 * Ce compte doit disparaître avant toute ouverture publique — il est listé dans
 * les bloquants du README.
 */
const COMPTE_DEV = { email: 'dev@flex.test', motDePasse: 'flex-dev-2026' };

export async function ouvrirSessionDeTest() {
  if (!__DEV__) throw new Error('Session de test indisponible hors développement.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email: COMPTE_DEV.email,
    password: COMPTE_DEV.motDePasse,
  });

  if (error) {
    return {
      ok: false as const,
      message: `${error.message} — le compte dev@flex.test existe-t-il sur le projet ?`,
    };
  }
  return { ok: true as const, message: data.user?.email ?? '' };
}

export async function fermerSessionDeTest() {
  const { error } = await supabase.auth.signOut();
  return { ok: !error, message: error?.message ?? '' };
}
