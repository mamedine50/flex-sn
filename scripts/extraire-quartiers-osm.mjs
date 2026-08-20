/**
 * Extraction UNIQUE des quartiers de la région de Dakar depuis OpenStreetMap.
 *
 *   node scripts/extraire-quartiers-osm.mjs > supabase/seed/quartiers.sql
 *
 * Ce script ne tourne PAS au runtime de l'application. Il produit un fichier SQL
 * de seed qu'on relit, qu'on corrige à la main si besoin, et qu'on versionne.
 * L'application, elle, ne connaît que la table locale : aucun appel à un service
 * de lieux, jamais.
 *
 * Pourquoi une table `quartiers` SÉPARÉE de `communes` plutôt qu'une table
 * `lieux` unique : ce qui est servi avant acceptation est la COMMUNE et jamais
 * le quartier fin, et deux tables rendent cette règle impossible à confondre —
 * `commune_la_plus_proche()` n'interroge que `communes`, et aucune jointure ne
 * peut faire entrer un quartier dans `demandes_ouvertes` par distraction. Une
 * table unique avec une colonne `type` mettrait les deux granularités à une
 * clause WHERE l'une de l'autre.
 *
 * Données © contributeurs OpenStreetMap, sous ODbL.
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Région de Dakar et sa périphérie utile. Bbox : sud, ouest, nord, est.
const BBOX = '14.55,-17.60,14.95,-17.05';

const REQUETE = `
[out:json][timeout:180];
(
  node["place"~"^(neighbourhood|suburb|quarter)$"]["name"](${BBOX});
  way["place"~"^(neighbourhood|suburb|quarter)$"]["name"](${BBOX});
  relation["place"~"^(neighbourhood|suburb|quarter)$"]["name"](${BBOX});
);
out center tags;
`;

/** Accents et casse retirés : c'est ainsi que la recherche compare. */
function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function code(nom) {
  return 'q-' + normaliser(nom).replace(/ /g, '-').slice(0, 48);
}

function echapper(texte) {
  return texte.replace(/'/g, "''");
}

const reponse = await fetch(OVERPASS, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `data=${encodeURIComponent(REQUETE)}`,
});

if (!reponse.ok) {
  console.error(`Overpass a répondu ${reponse.status}`);
  process.exit(1);
}

const { elements } = await reponse.json();

const vus = new Map();
for (const e of elements) {
  const nom = (e.tags?.name ?? '').trim();
  if (!nom) continue;

  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') continue;

  const cle = normaliser(nom);
  // Un même quartier apparaît souvent en node ET en way : on garde le premier.
  if (vus.has(cle)) continue;

  // Les noms alternatifs d'OSM sont exactement les noms d'usage qu'on cherche.
  const alias = [
    e.tags['alt_name'],
    e.tags['name:fr'],
    e.tags['short_name'],
    e.tags['old_name'],
  ]
    .filter(Boolean)
    .flatMap((v) => v.split(';'))
    .map((v) => v.trim())
    .filter((v) => v && normaliser(v) !== cle);

  vus.set(cle, { nom, lat, lon, alias: [...new Set(alias)], type: e.tags.place });
}

const quartiers = [...vus.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

console.log(`-- Quartiers de la région de Dakar, extraits d'OpenStreetMap.`);
console.log(`-- Données © contributeurs OpenStreetMap, sous ODbL.`);
console.log(`-- Généré par scripts/extraire-quartiers-osm.mjs — NE PAS éditer à la main`);
console.log(`-- sans reporter la correction dans le script ou dans une migration.`);
console.log(`-- ${quartiers.length} quartiers, bbox ${BBOX}.`);
console.log(``);
console.log(`insert into public.quartiers (code, nom, alias, lat, lon, type_osm) values`);

const lignes = quartiers.map(
  (q) =>
    `  ('${echapper(code(q.nom))}', '${echapper(q.nom)}', ` +
    `array[${q.alias.map((a) => `'${echapper(a)}'`).join(', ')}]::text[], ` +
    `${q.lat.toFixed(6)}, ${q.lon.toFixed(6)}, '${echapper(q.type)}')`,
);

console.log(lignes.join(',\n'));
console.log(`on conflict (code) do nothing;`);
