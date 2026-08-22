/**
 * Parcours V1 de bout en bout, avec DEUX sessions réelles et la clé anonyme.
 *
 * Ce n'est pas un test unitaire : les 287 assertions pgTAP tournent en
 * `postgres`, qui traverse les policies et les `grant`. Un droit manquant ne
 * s'y voit pas. Ce script passe par PostgREST comme l'application.
 *
 *   pnpm db:start && node scripts/parcours-v1.mjs
 *
 * CE QUI A CHANGÉ, ET POURQUOI. Il tournait auparavant sur le projet DISTANT
 * avec deux comptes à mot de passe versionné. Ces comptes étaient une porte
 * d'entrée : ils ont été supprimés. Le script travaille désormais sur la pile
 * LOCALE et fabrique ses acteurs à la volée par l'API admin — aucun mot de
 * passe, aucun compte qui survit à l'exécution.
 *
 * Ce qu'on y perd, et il faut le savoir : les `grant` du DISTANT ne sont plus
 * éprouvés par ce script. Ils le restent par les migrations, qui sont les mêmes
 * des deux côtés, et par l'inventaire de `supabase/tests/010_schema.sql`.
 *
 * La clé `service_role` est lue à la volée depuis `supabase status`. Elle ne
 * quitte jamais ce processus, et le script REFUSE de tourner ailleurs qu'en
 * local.
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
const PREFIXE = 'parcours-';

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
  const email = `${PREFIXE}${prenom.toLowerCase()}-${Date.now()}@flex.test`;
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

// ───────────────────────────────────────────────────────────── les sessions --
etape('Deux acteurs, créés pour ce passage');

const p = await acteur('Awa');
const c = await acteur('Ousmane', { conducteur: true });

const passager = p.sb;
const conducteur = c.sb;
const idPassager = p.id;
const idConducteur = c.id;

noter('session passager', true, p.email);
noter('session conducteur (documents validés, véhicule actif)', true, c.email);

// ───────────────────────────────────────────────── 1. le prix recommandé --
etape('1. Le passager fixe son prix');
const { data: suggere } = await passager.rpc('prix_suggere', {
  p_service: 'urbain',
  p_depart_lat: DEPART.lat,
  p_depart_lon: DEPART.lon,
  p_destination_lat: DESTINATION.lat,
  p_destination_lon: DESTINATION.lon,
});
noter('une recommandation existe', typeof suggere === 'number', `${suggere} FCFA`);

// EN DESSOUS de la recommandation : c'est tout l'objet du produit. Un système
// qui n'accepte que le prix suggéré n'est pas une négociation.
const prixPassager = Math.max(500, Math.round((suggere - 500) / 100) * 100);

const { data: demande, error: erreurDemande } = await passager.rpc('create_ride_request', {
  p_service: 'urbain',
  p_depart_lat: DEPART.lat,
  p_depart_lon: DEPART.lon,
  p_depart_libelle: DEPART.libelle,
  p_destination_lat: DESTINATION.lat,
  p_destination_lon: DESTINATION.lon,
  p_destination_libelle: DESTINATION.libelle,
  p_prix_xof: prixPassager,
  p_recommandation_xof: suggere,
});
if (erreurDemande) await sortir(`Demande refusée : ${erreurDemande.message}`);
noter('demande créée sous la recommandation', true, `${prixPassager} FCFA`);

// ────────────────────────────────────── 2. le conducteur voit la MAILLE --
etape('2. Le conducteur reçoit la demande');
await conducteur.rpc('maj_position', {
  p_lat: DEPART.lat + 0.004,
  p_lon: DEPART.lon + 0.004,
  p_en_ligne: true,
});

const { data: file, error: erreurFile } = await conducteur.rpc('demandes_proches', {
  p_rayon_m: 3000,
});
if (erreurFile) await sortir(`File refusée : ${erreurFile.message}`);

const vue = (file ?? []).find((d) => d.id === demande.id);
noter('la demande est dans la file du conducteur', Boolean(vue), `${file?.length ?? 0} demande(s)`);
noter(
  'le départ servi est la MAILLE, pas le point exact',
  vue !== undefined && (vue.zone_depart_lat !== DEPART.lat || vue.zone_depart_lon !== DEPART.lon),
  vue ? `${vue.zone_depart_lat} / ${vue.zone_depart_lon}` : '',
);
noter('la commune de départ est nommée', Boolean(vue?.depart_commune), vue?.depart_commune ?? '');
noter(
  'ni nom complet ni téléphone dans la file',
  vue !== undefined && !('passager_nom_complet' in vue) && !('passager_telephone' in vue),
);

// ─────────────────────────────────────────────── 3. l'offre, et la liste --
etape('3. Le conducteur répond');
const prixConducteur = prixPassager + 500;
const { data: offre, error: erreurOffre } = await conducteur.rpc('submit_offer', {
  p_demande_id: demande.id,
  p_type: 'contre_offre',
  p_prix_xof: prixConducteur,
  p_delai_arrivee_min: 6,
});
if (erreurOffre) await sortir(`Offre refusée : ${erreurOffre.message}`);
noter('contre-offre soumise', true, `${prixConducteur} FCFA · 6 min`);

const { data: recues } = await passager
  .from('offres_recues')
  .select('*')
  .eq('demande_id', demande.id);
const recue = (recues ?? [])[0];
noter('le passager voit l’offre', Boolean(recue), `${recues?.length ?? 0} offre(s)`);
noter(
  'prénom, véhicule et badge : oui — plaque et téléphone : non',
  recue !== undefined &&
    Boolean(recue.conducteur_prenom) &&
    Boolean(recue.vehicule_modele) &&
    !('vehicule_plaque' in recue) &&
    !('conducteur_telephone' in recue),
  recue ? `${recue.conducteur_prenom} · ${recue.vehicule_modele} ${recue.vehicule_couleur}` : '',
);
noter(
  'le badge remplace la note tant qu’il y a moins de cinq courses',
  recue !== undefined && typeof recue.conducteur_est_nouveau === 'boolean',
  recue ? `est_nouveau=${recue.conducteur_est_nouveau} · ${recue.conducteur_nb_courses} course(s)` : '',
);

// ─────────────────────── 4. AVANT acceptation : le passager ne voit rien --
etape('4. Avant acceptation, la confidentialité tient');
{
  const { data } = await passager
    .from('profiles')
    .select('id, prenom, nom_complet, telephone')
    .eq('id', idConducteur);
  const p = (data ?? [])[0];
  noter(
    'le passager ne lit ni le nom complet ni le numéro du conducteur',
    p === undefined || (p.nom_complet === null && p.telephone === null),
    p ? `nom=${p.nom_complet} tel=${p.telephone}` : 'aucune ligne servie',
  );

  const { data: v } = await passager.from('vehicles').select('plaque').eq('conducteur_id', idConducteur);
  noter('ni la plaque', (v ?? []).length === 0, `${v?.length ?? 0} ligne(s)`);

  const { data: pos } = await passager
    .from('positions_conducteurs')
    .select('lat, lon')
    .eq('conducteur_id', idConducteur);
  noter('ni la position', (pos ?? []).length === 0, `${pos?.length ?? 0} ligne(s)`);
}

// ────────────────────────────────────────── 5. acceptation : la bascule --
etape('5. Le passager accepte');
const { data: course, error: erreurAccept } = await passager.rpc('accept_offer', {
  p_offre_id: offre.id,
});
if (erreurAccept) await sortir(`Acceptation refusée : ${erreurAccept.message}`);
noter('course verrouillée', course?.statut === 'verrouillee', course?.id ?? '');
noter('au prix de l’offre acceptée', course?.prix_convenu_xof === prixConducteur,
  `${course?.prix_convenu_xof} FCFA`);

{
  const { data } = await passager
    .from('profiles')
    .select('prenom, nom_complet, telephone')
    .eq('id', idConducteur);
  const p = (data ?? [])[0];
  noter(
    'APRÈS acceptation : nom complet et numéro arrivent',
    Boolean(p?.nom_complet) && Boolean(p?.telephone),
    p ? `${p.nom_complet} · ${p.telephone}` : 'aucune ligne',
  );

  const { data: v } = await passager
    .from('vehicles')
    .select('plaque, modele, couleur')
    .eq('conducteur_id', idConducteur);
  noter('et la plaque aussi', (v ?? []).length === 1, v?.[0]?.plaque ?? '');
}

// ────────────────────────────────────────────── 6. la course, le suivi --
etape('6. En route');
for (const statut of ['en_route', 'arrive', 'commencee']) {
  const { error } = await conducteur.rpc('avancer_course', {
    p_course_id: course.id,
    p_statut: statut,
  });
  noter(`le conducteur passe à « ${statut} »`, !error, error?.message ?? '');
}

await conducteur.rpc('maj_position', {
  p_lat: DEPART.lat + 0.001,
  p_lon: DEPART.lon + 0.001,
  p_en_ligne: true,
});
{
  const { data } = await passager
    .from('positions_conducteurs')
    .select('lat, lon, maj_le')
    .eq('conducteur_id', idConducteur);
  noter('pendant la course, le passager suit la voiture', (data ?? []).length === 1,
    data?.[0] ? `${data[0].lat} / ${data[0].lon}` : 'rien');
}

const { error: erreurFin } = await conducteur.rpc('avancer_course', {
  p_course_id: course.id,
  p_statut: 'terminee',
});
noter('le conducteur termine', !erreurFin, erreurFin?.message ?? '');

{
  const { data } = await passager
    .from('positions_conducteurs')
    .select('lat, lon')
    .eq('conducteur_id', idConducteur);
  noter('course terminée, le suivi s’arrête', (data ?? []).length === 0,
    `${data?.length ?? 0} ligne(s)`);
}

// ──────────────────────────────────────────────────────── 7. les notes --
etape('7. Les deux notent');
{
  const { error: e1 } = await passager.rpc('noter_course', {
    p_course_id: course.id,
    p_note: 5,
    p_commentaire: 'Ponctuel.',
  });
  noter('le passager note', !e1, e1?.message ?? '');

  const { error: e2 } = await conducteur.rpc('noter_course', {
    p_course_id: course.id,
    p_note: 5,
  });
  noter('le conducteur note', !e2, e2?.message ?? '');

  const { data } = await passager
    .from('profils_publics')
    .select('prenom, courses_comme_conducteur, est_nouveau')
    .eq('id', idConducteur)
    .single();
  // Le compteur du VOLANT, pas celui de la personne : cinq courses de passager
  // ne font pas un conducteur expérimenté.
  noter('le compteur de courses AU VOLANT avance', (data?.courses_comme_conducteur ?? 0) > 0,
    `${data?.courses_comme_conducteur} course(s) · nouveau=${data?.est_nouveau}`);

  const { data: moi } = await passager
    .from('profils_publics')
    .select('courses_comme_conducteur')
    .eq('id', idPassager)
    .single();
  noter('le passager, lui, reste à zéro course au volant',
    moi?.courses_comme_conducteur === 0,
    `${moi?.courses_comme_conducteur} course(s)`);
}

await conducteur.rpc('maj_position', {
  p_lat: DEPART.lat,
  p_lon: DEPART.lon,
  p_en_ligne: false,
});

await nettoyer();

console.log(lignes.join('\n'));
console.log(
  `\n${echecs === 0 ? 'PARCOURS COMPLET — aucune assertion en échec.' : `${echecs} assertion(s) en échec.`}`,
);
console.log('Comptes éphémères effacés.');
process.exit(echecs === 0 ? 0 : 1);
