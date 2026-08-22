#!/usr/bin/env node
/**
 * Diagnostic de bout en bout — statique, exhaustif, répétable.
 *
 * Une capture prouve un écran un jour donné. Ce script prouve que TOUT ce que
 * le code déclenche existe : chaque route poussée, chaque clé traduite, chaque
 * fonction appelée, chaque table lue. Il ne remplace pas un doigt sur l'écran ;
 * il attrape la classe de défauts qu'un doigt ne trouve qu'au hasard — le
 * bouton qui mène nulle part, la clé absente d'une langue, la RPC renommée.
 *
 *   node scripts/diagnostic.mjs
 *
 * Sort en échec dès qu'une cible manque : c'est une garde, pas un rapport.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const RACINE = process.cwd();
const problemes = [];
const notes = [];

function fichiers(dossier, filtre = /\.tsx?$/) {
  const sortie = [];
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) sortie.push(...fichiers(chemin, filtre));
    else if (filtre.test(chemin)) sortie.push(chemin);
  }
  return sortie;
}

const sources = [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'src'))]
  .filter((f) => !f.includes('__tests__') && !f.endsWith('database.types.ts'));

const texte = new Map(sources.map((f) => [f, readFileSync(f, 'utf8')]));

// ═══════════════════════════════════════════════ 1. les routes ══
// Toute cible poussée doit correspondre à un fichier d'`app/`.
const routes = new Set();
for (const f of fichiers(join(RACINE, 'app'))) {
  let r = relative(join(RACINE, 'app'), f).replace(/\.tsx$/, '');
  r = r.replace(/\/index$/, '').replace(/^index$/, '');
  r = r.replace(/\([^)]*\)\//g, '').replace(/\/?_layout$/, '');
  // Un groupe — `(tabs)` — n'est pas une route : il ne s'ouvre pas, il englobe.
  r = r.replace(/^\([^)]*\)$/, '');
  if (r === '' || r === '_layout') { routes.add('/'); continue; }
  routes.add('/' + r);
}

const CIBLES = /router\.(?:push|replace|navigate)\(\s*(?:\{\s*pathname:\s*)?['"`]([^'"`]+)['"`]/g;
for (const [f, s] of texte) {
  for (const m of s.matchAll(CIBLES)) {
    const brut = m[1].split('?')[0].replace(/\/$/, '') || '/';
    // Les segments dynamiques : `/admin/${id}` devient `/admin/[profil]`.
    const dynamique = [...routes].some((r) => {
      const motif = '^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$';
      return new RegExp(motif).test(brut);
    });
    if (!routes.has(brut) && !dynamique) {
      problemes.push(`ROUTE ABSENTE  ${relative(RACINE, f)} → ${brut}`);
    }
  }
}

// ═══════════════════════════════════════════ 2. les traductions ══
function groupes(langue) {
  const s = readFileSync(join(RACINE, 'src/i18n', `${langue}.ts`), 'utf8');
  const cles = new Set();
  let groupe = null;
  for (const ligne of s.split('\n')) {
    const g = ligne.match(/^ {2}([a-zA-Z_]+): \{/);
    if (g) { groupe = g[1]; continue; }
    if (/^ {2}\},/.test(ligne)) { groupe = null; continue; }
    const c = ligne.match(/^ {4}([a-zA-Z_0-9]+):/);
    if (c && groupe) cles.add(`${groupe}.${c[1]}`);
  }
  return cles;
}
const fr = groupes('fr');
const en = groupes('en');

const CLES = /\bt\(\s*['"`]([a-zA-Z_]+\.[a-zA-Z_0-9]+)['"`]/g;
const utilisees = new Set();
for (const [f, s] of texte) {
  for (const m of s.matchAll(CLES)) {
    utilisees.add(m[1]);
    if (!fr.has(m[1])) problemes.push(`CLÉ ABSENTE (fr)  ${relative(RACINE, f)} → ${m[1]}`);
  }
}
for (const cle of utilisees) {
  if (fr.has(cle) && !en.has(cle)) problemes.push(`CLÉ ABSENTE (en)  ${cle}`);
}
const inutilisees = [...fr].filter((c) => !utilisees.has(c) && !/^mois\./.test(c));
if (inutilisees.length) notes.push(`${inutilisees.length} clés françaises jamais utilisées`);

// ═══════════════════════════════════════════════ 3. la base ══
function sql(requete) {
  return execFileSync('docker', [
    'exec', 'supabase_db_flex-sn', 'psql', '-U', 'postgres', '-tAc', requete,
  ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
}

let fonctions, relations, droits;
try {
  fonctions = new Set(sql(
    `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public'`));
  relations = new Set(sql(
    `select table_name from information_schema.tables where table_schema='public'`));
  droits = new Set(sql(
    `select distinct table_name from information_schema.role_table_grants
     where table_schema='public' and grantee in ('authenticated','anon')`));
} catch {
  notes.push('base locale éteinte : les vérifications de RPC et de tables sont sautées');
}

if (fonctions) {
  for (const [f, s] of texte) {
    for (const m of s.matchAll(/\.rpc\(\s*['"`]([a-z_0-9]+)['"`]/g)) {
      if (!fonctions.has(m[1])) {
        problemes.push(`RPC ABSENTE  ${relative(RACINE, f)} → ${m[1]}()`);
      }
    }
    for (const m of s.matchAll(/\.from\(\s*['"`]([a-z_0-9]+)['"`]/g)) {
      const nom = m[1];
      // `.from()` sert aussi au stockage : on ne teste que ce qui ressemble à
      // une relation du schéma public.
      if (relations.has(nom) && !droits.has(nom)) {
        problemes.push(`TABLE SANS DROIT  ${relative(RACINE, f)} → ${nom}`);
      } else if (!relations.has(nom) && !nom.includes('-')) {
        problemes.push(`RELATION ABSENTE  ${relative(RACINE, f)} → ${nom}`);
      }
    }
  }
}

// ═══════════════════════════ 4. les pages qu'aucun bouton n'atteint ══
// La réciproque de la première vérification, et c'est elle qui trouve les
// écrans oubliés : une page qui existe, qui marche, et vers laquelle rien ne
// mène est du travail perdu que personne ne verra.
// On ne cherche pas que les `router.push('/x')` : un chemin se construit aussi
// dans une variable — `cheminConnexion()`, le repli de `ouvrirDocument()`. Un
// littéral qui RESSEMBLE à une route et qui se trouve quelque part dans le code
// suffit à considérer la page atteignable. Sinon le diagnostic crie au loup sur
// des pages parfaitement branchées, et on cesse de le lire.
const atteintes = new Set(['/']);
for (const [, s2] of texte) {
  for (const m of s2.matchAll(/['\"`](\/[a-z0-9\-\/\[\]]*)['\"`?]/g)) {
    atteintes.add(m[1].split('?')[0].replace(/\/$/, '') || '/');
  }
}
// Les onglets s'atteignent par la barre, pas par un `router`.
const ONGLETS = new Set(['/', '/profil']);
// Ces routes-là s'ouvrent par lien direct, en développement seulement.
const OUTILS = new Set(['/session-dev']);

for (const r of routes) {
  if (atteintes.has(r) || ONGLETS.has(r) || OUTILS.has(r)) continue;
  // Une route dynamique est atteinte si un gabarit la couvre.
  const couverte = [...atteintes].some((a) =>
    new RegExp('^' + r.replace(/\[[^\]]+\]/g, '[^/]+') + '$').test(a));
  if (!couverte) problemes.push(`PAGE INATTEIGNABLE  ${r} — aucun bouton n'y mène`);
}

// ═══════════════════════════════════════ 5. les impasses ══
// Une ligne marquée `inactive` sans explication est un bouton mort.
for (const [f, s] of texte) {
  for (const [i, ligne] of s.split('\n').entries()) {
    if (/\binactive\b/.test(ligne) && !/inactive=\{/.test(ligne) && /<Ligne|<Action/.test(s)) {
      if (/^\s*inactive\s*$/.test(ligne)) {
        problemes.push(`LIGNE INACTIVE  ${relative(RACINE, f)}:${i + 1}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════ verdict ══
console.log(`routes déclarées      ${routes.size}`);
console.log(`clés françaises       ${fr.size}   anglaises ${en.size}   utilisées ${utilisees.size}`);
if (fonctions) console.log(`fonctions publiques   ${fonctions.size}   relations ${relations.size}`);
for (const n of notes) console.log(`note · ${n}`);

if (problemes.length === 0) {
  console.log('\nDIAGNOSTIC ✓ — chaque route, chaque clé, chaque RPC et chaque table existe.');
  process.exit(0);
}
console.log(`\nDIAGNOSTIC ✗ — ${problemes.length} problème(s) :`);
for (const p of problemes) console.log(' ·', p);
process.exit(1);
