/**
 * Parcours V1 de bout en bout, sur le projet DISTANT, avec DEUX sessions.
 *
 * Ce n'est pas un test unitaire : les tests pgTAP tournent en `postgres`, qui
 * traverse tout. Ici on passe par PostgREST avec la clé anonyme et deux vraies
 * sessions — c'est le seul endroit où un `grant` manquant se voit.
 *
 * Ce que le parcours prouve, dans l'ordre où un utilisateur le vit :
 *   1. le passager reçoit une recommandation, et propose EN DESSOUS ;
 *   2. le conducteur voit la demande par la MAILLE, jamais par le point exact ;
 *   3. avant acceptation, ni nom complet, ni numéro, ni plaque ;
 *   4. après acceptation, les trois arrivent — c'est la bascule ;
 *   5. la position du conducteur n'est servie que pendant la course ;
 *   6. la course se termine et se note.
 *
 *   node scripts/parcours-v1.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(racine, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

// Deux comptes de développement, sur le distant. Ils partent avec le compte dev
// avant l'ouverture publique — voir les bloquants du README.
const COMPTES = {
  passager: { email: 'dev@flex.test', password: 'flex-dev-2026' },
  conducteur: { email: 'essai-route@flex.test', password: 'essai-route-2026' },
};

// Colobane → Mermoz. Deux points réels, à 3,3 km l'un de l'autre.
const DEPART = { lat: 14.7091, lon: -17.4478, libelle: 'Colobane' };
const DESTINATION = { lat: 14.7074, lon: -17.4744, libelle: 'Mermoz' };

const client = () =>
  createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const lignes = [];
let echecs = 0;
const noter = (nom, ok, detail = '') => {
  if (!ok) echecs += 1;
  lignes.push(`${ok ? '✓' : '✗'} ${nom.padEnd(56)} ${detail}`);
};
const etape = (titre) => lignes.push(`\n── ${titre}`);

const sortir = (message) => {
  console.log(lignes.join('\n'));
  console.log(`\n${message}`);
  process.exit(1);
};

// ───────────────────────────────────────────────────────────── les sessions --
etape('Deux sessions');
const passager = client();
const conducteur = client();

const { data: sp, error: ep } = await passager.auth.signInWithPassword(COMPTES.passager);
if (ep) sortir(`Session passager refusée : ${ep.message}`);
const { data: sc, error: ec } = await conducteur.auth.signInWithPassword(COMPTES.conducteur);
if (ec) sortir(`Session conducteur refusée : ${ec.message}`);

const idPassager = sp.user.id;
const idConducteur = sc.user.id;
noter('session passager', Boolean(sp.session), idPassager);
noter('session conducteur', Boolean(sc.session), idConducteur);

// ─────────────────────────────────────────────── on part d'une table nette --
etape('État de départ');
{
  const { data } = await conducteur
    .from('rides')
    .select('id, statut')
    .in('statut', ['verrouillee', 'en_route', 'arrive', 'commencee', 'en_cours']);

  for (const c of data ?? []) {
    await conducteur.rpc('annuler_course', {
      p_course_id: c.id,
      p_motif: 'Nettoyage avant le parcours de bout en bout.',
    });
  }
  noter('aucune course active au départ', true, `${data?.length ?? 0} nettoyée(s)`);
}

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
if (erreurDemande) sortir(`Demande refusée : ${erreurDemande.message}`);
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
if (erreurFile) sortir(`File refusée : ${erreurFile.message}`);

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
if (erreurOffre) sortir(`Offre refusée : ${erreurOffre.message}`);
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
if (erreurAccept) sortir(`Acceptation refusée : ${erreurAccept.message}`);
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

console.log(lignes.join('\n'));
console.log(
  `\n${echecs === 0 ? 'PARCOURS COMPLET — aucune assertion en échec.' : `${echecs} assertion(s) en échec.`}`,
);
process.exit(echecs === 0 ? 0 : 1);
