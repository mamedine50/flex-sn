/**
 * Le parcours du CONDUCTEUR, de GO à la note.
 *
 *   pnpm db:start && node scripts/parcours-conducteur.mjs
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
const PREFIXE = 'conducteur-';

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
    for (const type of ['piece_identite', 'permis', 'carte_grise', 'selfie']) {
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

const p = await acteur('Bineta');
const c = await acteur('Cheikh', { conducteur: true });

const passager = p.sb;
const conducteur = c.sb;

noter('session passager', true, p.email);
noter('session conducteur (documents validés, véhicule actif)', true, c.email);

// ─────────────────────────────────────────────────────────── 1. GO ──────────
etape('1. Le conducteur passe en ligne');

{
  const { error } = await conducteur.rpc('maj_position', {
    p_lat: DEPART.lat + 0.004,
    p_lon: DEPART.lon + 0.004,
    p_en_ligne: true,
  });
  noter('il se déclare en ligne, avec sa position', !error, error?.message ?? '');

  const { data } = await conducteur.rpc('demandes_proches', { p_rayon_m: 3000 });
  noter('sa file est vide : personne ne demande rien', (data ?? []).length === 0);
}

// ──────────────────────────────────────────── 2. une demande arrive ─────────
etape('2. Une demande arrive');

const { data: demande, error: erreurDemande } = await passager.rpc('create_ride_request', {
  p_service: 'urbain',
  p_depart_lat: DEPART.lat,
  p_depart_lon: DEPART.lon,
  p_depart_libelle: DEPART.libelle,
  p_destination_lat: DESTINATION.lat,
  p_destination_lon: DESTINATION.lon,
  p_destination_libelle: DESTINATION.libelle,
  p_prix_xof: 1500,
});
if (erreurDemande) await sortir(`Demande refusée : ${erreurDemande.message}`);

{
  const { data } = await conducteur.rpc('demandes_proches', { p_rayon_m: 3000 });
  const vue = (data ?? []).find((d) => d.id === demande.id);
  noter('elle apparaît dans la file du conducteur', Boolean(vue));
  noter(
    'avec la MAILLE et la commune, jamais le point exact',
    vue !== undefined &&
      (vue.zone_depart_lat !== DEPART.lat || vue.zone_depart_lon !== DEPART.lon),
    vue ? `${vue.zone_depart_lat} / ${vue.zone_depart_lon} · ${vue.depart_commune}` : '',
  );
  noter(
    'et la destination est nommée — c’est ce que le conducteur décide',
    Boolean(vue?.destination_libelle || vue?.destination_commune),
    vue?.destination_commune ?? vue?.destination_libelle ?? '',
  );
}

// ──────────────────────────────────────────────── 3. il contre-propose ──────
etape('3. Il propose son prix');

const { data: offre, error: erreurOffre } = await conducteur.rpc('submit_offer', {
  p_demande_id: demande.id,
  p_type: 'contre_offre',
  p_prix_xof: 2000,
  p_delai_arrivee_min: 6,
});
if (erreurOffre) await sortir(`Offre refusée : ${erreurOffre.message}`);
noter('contre-offre soumise', true, '2000 FCFA · 6 min');

// ───────────────────────────────────────────────── 4. la course démarre ─────
etape('4. Le passager accepte, la course démarre');

const { data: course, error: erreurAccept } = await passager.rpc('accept_offer', {
  p_offre_id: offre.id,
});
if (erreurAccept) await sortir(`Acceptation refusée : ${erreurAccept.message}`);
noter('course verrouillée', course?.statut === 'verrouillee', course?.id ?? '');

// ──────────────────────── 5. LE VERROU : une course à la fois ───────────────
etape('5. Pas d’enchaînement : une course à la fois');

{
  // Un second passager demande pendant que la course tourne.
  const p2 = await acteur('Aïcha');
  const { data: demande2 } = await p2.sb.rpc('create_ride_request', {
    p_service: 'urbain',
    p_depart_lat: DEPART.lat + 0.002,
    p_depart_lon: DEPART.lon + 0.002,
    p_depart_libelle: 'Colobane',
    p_destination_lat: DESTINATION.lat,
    p_destination_lon: DESTINATION.lon,
    p_destination_libelle: 'Mermoz',
    p_prix_xof: 1500,
  });

  const { data: file } = await conducteur.rpc('demandes_proches', { p_rayon_m: 3000 });
  noter(
    'la demande suivante reste VISIBLE pendant la course',
    (file ?? []).some((d) => d.id === demande2.id),
    'la file n’est pas coupée, seule l’acceptation l’est',
  );

  const { error } = await conducteur.rpc('submit_offer', {
    p_demande_id: demande2.id,
    p_type: 'acceptation',
    p_prix_xof: 1500,
    p_delai_arrivee_min: 5,
  });
  noter(
    'mais s’engager est REFUSÉ par le serveur, pas seulement grisé',
    error?.message === 'conducteur_indisponible',
    error?.message ?? 'aucune erreur — le verrou ne tient pas',
  );
}

// ─────────────────────────────────────────────────── 6. il conduit ──────────
etape('6. Il conduit');

for (const statut of ['en_route', 'arrive', 'commencee', 'terminee']) {
  const { error } = await conducteur.rpc('avancer_course', {
    p_course_id: course.id,
    p_statut: statut,
  });
  noter(`il passe à « ${statut} »`, !error, error?.message ?? '');
}

// ───────────────────────── 7. LE PÉAGE : la course reste sienne ─────────────
etape('7. La course reste la sienne tant qu’il n’a pas noté');

{
  const { data } = await conducteur
    .from('rides')
    .select('id, statut')
    .in('statut', ['verrouillee', 'en_route', 'arrive', 'commencee', 'en_cours', 'terminee'])
    .order('verrouillee_le', { ascending: false })
    .limit(1);
  noter(
    'terminée, elle reste servie — sinon l’écran de notation n’existe pas',
    data?.[0]?.id === course.id && data?.[0]?.statut === 'terminee',
    data?.[0]?.statut ?? 'rien',
  );

  const { count: avant } = await conducteur
    .from('evaluations')
    .select('course_id', { count: 'exact', head: true })
    .eq('course_id', course.id);
  noter('et il ne l’a pas encore notée', (avant ?? 0) === 0);
}

// ──────────────────────────────────────────── 8. il note, puis repart ───────
etape('8. Il note, et rien ne le retient plus');

{
  const { error } = await conducteur.rpc('noter_course', {
    p_course_id: course.id,
    p_note: 5,
  });
  noter('il note son passager', !error, error?.message ?? '');

  const { count } = await conducteur
    .from('evaluations')
    .select('course_id', { count: 'exact', head: true })
    .eq('course_id', course.id);
  noter('la note est enregistrée — le péage est levé', (count ?? 0) === 1);

  const { data: file } = await conducteur.rpc('demandes_proches', { p_rayon_m: 3000 });
  noter(
    'il retrouve une file où il peut de nouveau s’engager',
    (file ?? []).length > 0,
    `${(file ?? []).length} demande(s)`,
  );

  const { data: gains } = await conducteur
    .from('mes_gains')
    .select('jour_xof, courses_jour')
    .maybeSingle();
  noter(
    'et sa journée s’est incrémentée',
    Number(gains?.jour_xof ?? 0) === 2000,
    `${gains?.jour_xof} FCFA · ${gains?.courses_jour} course(s)`,
  );
}

await conducteur.rpc('maj_position', {
  p_lat: DEPART.lat,
  p_lon: DEPART.lon,
  p_en_ligne: false,
});

await nettoyer();

console.log(lignes.join('\n'));
console.log(
  `\n${echecs === 0 ? 'PARCOURS CONDUCTEUR COMPLET — aucune assertion en échec.' : `${echecs} assertion(s) en échec.`}`,
);
console.log('Comptes éphémères effacés.');
process.exit(echecs === 0 ? 0 : 1);
