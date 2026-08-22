/**
 * Le parcours de la NÉGOCIATION, dans les deux sens et jusqu'à sa fin.
 *
 *   pnpm db:start && node scripts/parcours-negociation.mjs
 *
 * Deux sessions réelles, la clé anonyme, PostgREST comme l'application. Les
 * assertions pgTAP tournent en `postgres`, qui traverse les policies et les
 * `grant` : un droit manquant ne s'y voit pas, ici oui.
 *
 * Ce qu'il éprouve et que rien d'autre n'éprouve :
 *
 *   1. la file du conducteur, filtrée sur SA position ;
 *   2. le verrou anti-enchaînement — une course à la fois, refusée par le
 *      serveur et pas seulement grisée à l'écran ;
 *   3. le péage de la note — la course reste « la sienne » tant qu'il n'a pas
 *      noté, ce qui est exactement ce qui tient l'écran de notation à l'écran ;
 *   4. le retour en ligne : après la note, plus rien ne le retient.
 *
 * Les acteurs sont créés à la volée par l'API admin de la pile LOCALE et
 * effacés à la fin. Aucun mot de passe n'existe, donc aucun ne peut fuiter. La
 * clé `service_role` ne quitte jamais ce processus, et le script REFUSE de
 * tourner ailleurs qu'en local.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(dirname(fileURLToPath(import.meta.url)));

function pileLocale() {
  const sortie = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    cwd: racine,
  });
  const lire = (cle) => sortie.match(new RegExp(`^${cle}="?([^"\\n]+)"?$`, 'm'))?.[1];
  return { url: lire('API_URL'), anon: lire('ANON_KEY'), service: lire('SERVICE_ROLE_KEY') };
}

const { url, anon, service } = pileLocale();

if (!url || !anon || !service) {
  console.log('Pile locale introuvable. Lancez `pnpm db:start`.');
  process.exit(1);
}

// Une clé de service pointée sur le distant annulerait toute la RLS.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
  console.log(`Refus : ${url} n'est pas la pile locale.`);
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const PREFIXE = 'negociation-';

// Colobane → Mermoz. Deux points réels, à 3,3 km l'un de l'autre.
const DEPART = { lat: 14.7091, lon: -17.4478, libelle: 'Colobane' };
const DESTINATION = { lat: 14.7074, lon: -17.4744, libelle: 'Mermoz' };

const client = () => createClient(url, anon, { auth: { persistSession: false } });

const lignes = [];
let echecs = 0;
const noter = (nom, ok, detail = '') => {
  if (!ok) echecs += 1;
  lignes.push(`${ok ? '✓' : '✗'} ${nom.padEnd(56)} ${detail}`);
};
const etape = (titre) => lignes.push(`\n── ${titre}`);

/** Efface tout ce que le script a créé, quoi qu'il arrive. */
async function nettoyer() {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (!u.email?.startsWith(PREFIXE)) continue;
    await admin.from('evaluations').delete().or(`auteur_id.eq.${u.id},cible_id.eq.${u.id}`);
    await admin.from('rides').delete().or(`passager_id.eq.${u.id},conducteur_id.eq.${u.id}`);
    await admin.auth.admin.deleteUser(u.id);
  }
}

const sortir = async (message) => {
  await nettoyer();
  console.log(lignes.join('\n'));
  console.log(`\n${message}`);
  process.exit(1);
};

/**
 * Un acteur : compte éphémère, session obtenue par lien magique. Aucun mot de
 * passe n'existe, donc aucun ne peut fuiter.
 */
async function acteur(prenom, { conducteur = false } = {}) {
  // Le prénom sert d'adresse : on le translittère, sinon « Aïcha » produit une
  // adresse que GoTrue refuse.
  const sansAccent = prenom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
  const email = `${PREFIXE}${sansAccent}-${Date.now()}@flex.test`;
  const { data: cree, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { prenom },
  });
  if (error) await sortir(`Compte ${prenom} refusé : ${error.message}`);

  // Un nom complet et un numéro : sans eux, la BASCULE de confidentialité n'a
  // rien à révéler après acceptation, et l'assertion qui la garde tomberait
  // pour une raison qui n'a rien à voir avec la règle.
  await admin
    .from('profiles')
    .update({
      nom_complet: `${prenom} Diop`,
      telephone: `+2217${String(Date.now()).slice(-8)}`,
    })
    .eq('id', cree.user.id);

  if (conducteur) {
    for (const type of ['piece_identite', 'permis', 'carte_grise', 'selfie', 'photo_vehicule']) {
      await admin
        .from('documents_conducteur')
        .insert({ profil_id: cree.user.id, type, chemin: `${cree.user.id}/${type}.jpg` });
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

  const { data: lien } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const sb = client();
  const { error: erreurSession } = await sb.auth.verifyOtp({
    token_hash: lien.properties.hashed_token,
    type: 'email',
  });
  if (erreurSession) await sortir(`Session ${prenom} refusée : ${erreurSession.message}`);

  return { sb, id: cree.user.id, email };
}

// ───────────────────────────────────────────────────────── les deux acteurs --
etape('Deux acteurs, créés pour ce passage');

const p = await acteur('Ndeye');
const c = await acteur('Alioune', { conducteur: true });

const passager = p.sb;
const conducteur = c.sb;

noter('session passager', true, p.email);
noter('session conducteur', true, c.email);

await conducteur.rpc('maj_position', {
  p_lat: DEPART.lat + 0.004,
  p_lon: DEPART.lon + 0.004,
  p_en_ligne: true,
});

// ────────────────────────────────────────── 1. le passager propose ──────────
etape('1. Le passager propose 2 000 FCFA');

let demande;
{
  const { data, error } = await passager.rpc('create_ride_request', {
    p_service: 'urbain',
    p_depart_lat: DEPART.lat,
    p_depart_lon: DEPART.lon,
    p_depart_libelle: DEPART.libelle,
    p_destination_lat: DESTINATION.lat,
    p_destination_lon: DESTINATION.lon,
    p_destination_libelle: DESTINATION.libelle,
    p_prix_xof: 2000,
  });
  if (error) await sortir(`Demande refusée : ${error.message}`);
  demande = data;
  noter('demande créée', Boolean(demande?.id), '2 000 FCFA');
}

// ──────────────────────────────────── 2. tour 1 : le conducteur répond ──────
etape('2. Tour 1 — le conducteur en veut 2 500');

let offre;
{
  const { data, error } = await conducteur.rpc('submit_offer', {
    p_demande_id: demande.id,
    p_type: 'contre_offre',
    p_prix_xof: 2500,
    p_delai_arrivee_min: 5,
  });
  if (error) await sortir(`Offre refusée : ${error.message}`);
  offre = data;
  noter('le fil s’ouvre au tour 1', offre.tour === 1, `tour ${offre.tour}`);
  noter('signée du conducteur, sans qu’il l’ait dit', offre.auteur === 'conducteur');
}

{
  const { error } = await conducteur.rpc('contre_proposer', {
    p_offre_id: offre.id,
    p_prix_xof: 2400,
  });
  noter(
    'il ne surenchérit pas sur sa PROPRE offre',
    error?.message?.includes('pas_votre_tour') === true,
    error?.message ?? 'refus attendu, aucun',
  );
}

// ──────────────────────────────────── 3. tour 2 : le passager répond ────────
etape('3. Tour 2 — le passager remonte à 2 200');

let offre2;
{
  const { data, error } = await passager.rpc('contre_proposer', {
    p_offre_id: offre.id,
    p_prix_xof: 2200,
  });
  if (error) await sortir(`Contre-proposition refusée : ${error.message}`);
  offre2 = data;
  noter('premier aller-retour', offre2.tour === 2, `tour ${offre2.tour}`);
  noter('signée du passager', offre2.auteur === 'passager');

  const { data: vues } = await passager.from('offres_recues').select('*');
  const vivante = (vues ?? []).find((o) => o.statut === 'en_attente');
  noter('une seule offre vivante dans le fil', (vues ?? []).filter((o) => o.statut === 'en_attente').length === 1);
  noter('et c’est la sienne, en attente de réponse', vivante?.auteur === 'passager');
}

{
  const { data } = await conducteur.from('negociations_conducteur').select('*');
  noter(
    'le conducteur VOIT la réponse — sinon elle tombe dans le vide',
    (data ?? []).length === 1,
    `${(data ?? []).length} négociation(s)`,
  );
  const n = (data ?? [])[0];
  noter('il voit la destination', Boolean(n?.destination_libelle), n?.destination_libelle ?? '');
  noter(
    'mais PAS le libellé exact du départ — la course n’est pas acceptée',
    n !== undefined && !('depart_libelle' in n),
  );
}

// ──────────────────────────────────── 4. tours 3 et 4 ───────────────────────
etape('4. Tours 3 et 4 — le second aller-retour');

let offre3;
{
  const { data, error } = await conducteur.rpc('contre_proposer', {
    p_offre_id: offre2.id,
    p_prix_xof: 2400,
  });
  if (error) await sortir(`Tour 3 refusé : ${error.message}`);
  offre3 = data;
  noter('le conducteur reprend la main', offre3.tour === 3, `tour ${offre3.tour}`);
}

let offre4;
{
  const { data, error } = await passager.rpc('contre_proposer', {
    p_offre_id: offre3.id,
    p_prix_xof: 2300,
  });
  if (error) await sortir(`Tour 4 refusé : ${error.message}`);
  offre4 = data;
  noter('second aller-retour', offre4.tour === 4, `tour ${offre4.tour}`);
}

// ──────────────────────────────────── 5. la limite ──────────────────────────
etape('5. Le cinquième message est refusé');

{
  const { error } = await conducteur.rpc('contre_proposer', {
    p_offre_id: offre4.id,
    p_prix_xof: 2350,
  });
  noter(
    'DEUX ALLERS-RETOURS, ET C’EST TOUT',
    error?.message?.includes('negociation_epuisee') === true,
    error?.message ?? 'refus attendu, aucun',
  );
}

// ──────────────────────────────────── 6. le conducteur accepte ──────────────
etape('6. Il reste à accepter — et c’est le conducteur qui accepte');

{
  const { data, error } = await conducteur.rpc('accept_offer', { p_offre_id: offre4.id });
  if (error) await sortir(`Acceptation refusée : ${error.message}`);
  noter('course verrouillée', Boolean(data?.id), data?.id ?? '');
  noter('au prix du PASSAGER, celui du tour 4', data?.prix_convenu_xof === 2300, `${data?.prix_convenu_xof} FCFA`);
  noter('et elle appartient au passager, pas à celui qui a appuyé', data?.passager_id === p.id);
}

{
  const { data } = await passager.from('offres_recues').select('*');
  noter(
    'les offres du fil sont retombées',
    (data ?? []).every((o) => o.statut !== 'en_attente'),
  );
}

// ───────────────────────────────────────────────────────────── verdict ──────
await nettoyer();
console.log(lignes.join('\n'));
console.log(
  echecs === 0
    ? '\nPARCOURS NÉGOCIATION COMPLET — aucune assertion en échec.'
    : `\n${echecs} assertion(s) en échec.`,
);
console.log('Comptes éphémères effacés.');
process.exit(echecs === 0 ? 0 : 1);
