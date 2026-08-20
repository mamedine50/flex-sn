/**
 * Garde de build : le compte de développement ne doit pas RENAÎTRE.
 *
 *   node scripts/garde-compte-dev.mjs
 *
 * `dev@flex.test` ouvre une session sans OTP et son mot de passe est en clair
 * dans `src/lib/sessionDev.ts`. Sur une base ouverte au public, c'est une porte
 * d'entrée. Il est listé dans les bloquants du README — mais personne ne relit
 * la liste des bloquants le jour du lancement, d'où cette garde.
 *
 * Elle tente une connexion avec la clé anonyme : si elle réussit, le compte
 * existe et le build s'arrête. Aucune clé de service n'est nécessaire.
 *
 * Limite connue : si quelqu'un change le mot de passe sans supprimer le compte,
 * la garde ne le voit plus. Elle couvre le cas réel — l'oubli — pas le
 * contournement délibéré.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

/**
 * Ce couple n'est PLUS un secret : le compte a été supprimé du distant, et le
 * mot de passe ne vaut plus rien. Il reste ici parce que c'est exactement ce
 * que la garde cherche — une résurrection du compte, par restauration de
 * sauvegarde ou par distraction. Une garde qui ne sait pas quoi essayer ne
 * garde rien.
 */
const COMPTE = { email: 'dev@flex.test', motDePasse: 'flex-dev-2026' };

function lireEnv() {
  const depuisProcessus = {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    cle: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
  if (depuisProcessus.url && depuisProcessus.cle) return depuisProcessus;

  try {
    const fichier = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const paires = Object.fromEntries(
      fichier
        .split('\n')
        .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    );
    return {
      url: paires.EXPO_PUBLIC_SUPABASE_URL,
      cle: paires.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    };
  } catch {
    return { url: undefined, cle: undefined };
  }
}

const production = process.env.EAS_BUILD_PROFILE === 'production';
const { url, cle } = lireEnv();

if (!url || !cle) {
  // En production, ne pas pouvoir vérifier vaut un échec : l'application elle-même
  // ne démarrerait pas sans ces variables.
  if (production) {
    console.error(
      'GARDE ✗ EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY absentes : impossible de vérifier ' +
        'que dev@flex.test a été supprimé. Build de production interrompu.',
    );
    process.exit(1);
  }
  console.log('GARDE — variables Supabase absentes, vérification ignorée hors production.');
  process.exit(0);
}

const sb = createClient(url, cle, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await sb.auth.signInWithPassword({
  email: COMPTE.email,
  password: COMPTE.motDePasse,
});

if (data?.session) {
  await sb.auth.signOut();

  const message =
    `le compte ${COMPTE.email} existe sur ${url}.\n` +
    '  Il ouvre une session sans OTP avec un mot de passe versionné.\n' +
    "  Pour le supprimer :\n" +
    `      delete from auth.users where email = '${COMPTE.email}';`;

  // Un build de développement en a BESOIN — c'est lui qui permet de travailler
  // sans fournisseur SMS. Seule la production refuse.
  if (!production) {
    console.log(`GARDE — ${message}`);
    console.log('  Build hors production : toléré.');
    process.exit(0);
  }

  console.error(`GARDE ✗ ${message}`);
  process.exit(1);
}

void error;
console.log(`GARDE ✓ ${COMPTE.email} ne peut pas ouvrir de session — ${url}`);
