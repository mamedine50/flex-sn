/**
 * Une session de développement SANS mot de passe, SANS porte dérobée.
 *
 *   node scripts/session-locale.mjs            # crée une session, rend un lien
 *   node scripts/session-locale.mjs --conducteur
 *   node scripts/session-locale.mjs --nettoyer # efface les comptes éphémères
 *
 * Ce qui a remplacé quoi : `dev@flex.test` ouvrait une session avec un mot de
 * passe versionné dans le dépôt, sur le projet DISTANT. C'était une porte
 * d'entrée, et elle a été supprimée.
 *
 * À la place : la clé `service_role` de la pile LOCALE, lue à la volée depuis
 * `supabase status`, crée un compte éphémère et fabrique un lien magique. Le
 * jeton de ce lien s'échange contre une session par la clé ANONYME — celle que
 * l'application porte déjà.
 *
 * Deux garde-fous, et ils ne sont pas décoratifs :
 *   - le script REFUSE de tourner ailleurs qu'en local (127.0.0.1) ;
 *   - la clé `service_role` ne quitte jamais ce processus. Elle n'entre ni dans
 *     le dépôt, ni dans un fichier, ni dans le paquet de l'application.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';

const NETTOYER = process.argv.includes('--nettoyer');
const CONDUCTEUR = process.argv.includes('--conducteur');

/** `supabase status` porte les clés de la pile locale. Rien n'est écrit sur disque. */
function pileLocale() {
  const sortie = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: new URL('..', import.meta.url).pathname,
  });
  const lire = (cle) => {
    const m = sortie.match(new RegExp(`^${cle}="?([^"\\n]+)"?$`, 'm'));
    return m?.[1];
  };
  return {
    url: lire('API_URL'),
    anon: lire('ANON_KEY'),
    service: lire('SERVICE_ROLE_KEY'),
  };
}

const { url, anon, service } = pileLocale();

if (!url || !anon || !service) {
  console.error('Pile locale introuvable. Lancez `pnpm db:start`.');
  process.exit(1);
}

// LE garde-fou. Une clé de service pointée sur le distant annulerait toute la
// RLS, et c'est exactement l'accident que ce script doit rendre impossible.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.error(`Refus : ${url} n'est pas la pile locale. Ce script ne sort jamais de 127.0.0.1.`);
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const PREFIXE = 'ephemere-';

if (NETTOYER) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const cibles = (data?.users ?? []).filter((u) => u.email?.startsWith(PREFIXE));
  for (const u of cibles) await admin.auth.admin.deleteUser(u.id);
  console.log(`${cibles.length} compte(s) éphémère(s) effacé(s).`);
  process.exit(0);
}

const courriel = `${PREFIXE}${Date.now()}@flex.test`;

const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
  email: courriel,
  email_confirm: true,
  user_metadata: { prenom: CONDUCTEUR ? 'Ousmane' : 'Awa' },
});
if (erreurCreation) {
  console.error(`Création refusée : ${erreurCreation.message}`);
  process.exit(1);
}

// Un conducteur en règle : quatre pièces validées et un véhicule actif. Sans
// ça `est_conducteur()` reste faux et le mode conducteur ne s'ouvre pas.
if (CONDUCTEUR) {
  const pieces = ['piece_identite', 'permis', 'carte_grise', 'selfie'];
  for (const type of pieces) {
    await admin.from('documents_conducteur').insert({
      profil_id: cree.user.id,
      type,
      chemin: `${cree.user.id}/${type}.jpg`,
    });
    await admin.rpc('decider_document', {
      p_profil: cree.user.id,
      p_type: type,
      p_valide: true,
    });
  }
  await admin.from('vehicles').insert({
    conducteur_id: cree.user.id,
    plaque: `DK-${String(Date.now()).slice(-4)}-EP`,
    modele: 'Kia Picanto',
    couleur: 'grise',
  });
}

/**
 * Le lien magique donne un `token_hash`. C'est lui, et non un mot de passe, qui
 * s'échange contre une session — et l'échange se fait avec la clé ANONYME.
 */
const { data: lien, error: erreurLien } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: courriel,
});
if (erreurLien) {
  console.error(`Lien refusé : ${erreurLien.message}`);
  process.exit(1);
}

const jeton = lien.properties.hashed_token;

// On vérifie tout de suite que le jeton vaut bien une session, avec la clé
// anonyme : mieux vaut échouer ici que dans le simulateur.
const client = createClient(url, anon, { auth: { persistSession: false } });
const { error: erreurEchange } = await client.auth.verifyOtp({
  token_hash: jeton,
  type: 'email',
});
if (erreurEchange) {
  console.error(`Le jeton ne s'échange pas : ${erreurEchange.message}`);
  process.exit(1);
}

// Un jeton se consomme. On en refait un pour l'application.
const { data: lien2 } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email: courriel,
});

console.log(`compte    ${courriel}${CONDUCTEUR ? '  (conducteur validé)' : ''}`);
console.log(`identifiant ${cree.user.id}`);
console.log('');
console.log('Ouvrir la session dans le simulateur :');
console.log(`  xcrun simctl openurl booted "exp://127.0.0.1:8081/--/session-dev?jeton=${lien2.properties.hashed_token}"`);
console.log('');
console.log('Effacer les comptes éphémères ensuite :');
console.log('  node scripts/session-locale.mjs --nettoyer');
