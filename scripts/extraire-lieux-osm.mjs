/**
 * Extraction UNIQUE des quartiers et points stratégiques de Dakar depuis
 * OpenStreetMap.
 *
 *   node scripts/extraire-lieux-osm.mjs > supabase/seed/lieux.sql
 *
 * Ce script ne tourne PAS au runtime. Il produit un fichier SQL qu'on relit,
 * qu'on corrige si besoin, et qu'on versionne. L'application ne connaît que la
 * table locale : aucun appel à un service de lieux, jamais.
 *
 * FORME RETENUE — une table `lieux` unique avec une colonne `categorie`, et la
 * table `communes` laissée SÉPARÉE : c'est la commune qu'on sert au conducteur
 * avant acceptation et jamais un lieu, donc la séparation physique rend la
 * confusion impossible ; quartiers et points d'intérêt, eux, partagent le même
 * usage — la recherche, et rien d'autre — et méritent une seule table.
 *
 * Données © contributeurs OpenStreetMap, sous ODbL.
 */

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/**
 * Région de Dakar, élargie à l'est pour englober l'AIBD (14,67 / -17,07), qui
 * est hors région administrative mais qu'on cherche évidemment.
 */
const BBOX = '14.40,-17.60,14.95,-16.95';

/** Une catégorie par usage, pas par taxonomie OSM. */
const CATEGORIES = [
  { categorie: 'quartier', filtre: '["place"~"^(neighbourhood|suburb|quarter)$"]' },
  { categorie: 'aeroport', filtre: '["aeroway"="aerodrome"]' },
  { categorie: 'gare', filtre: '["amenity"="bus_station"]' },
  { categorie: 'gare', filtre: '["railway"="station"]' },
  { categorie: 'gare', filtre: '["amenity"="ferry_terminal"]' },
  { categorie: 'stade', filtre: '["leisure"="stadium"]' },
  { categorie: 'hotel', filtre: '["tourism"="hotel"]' },
  { categorie: 'hopital', filtre: '["amenity"="hospital"]' },
  { categorie: 'hopital', filtre: '["amenity"="clinic"]' },
  { categorie: 'universite', filtre: '["amenity"="university"]' },
  { categorie: 'universite', filtre: '["amenity"="college"]' },
  { categorie: 'marche', filtre: '["amenity"="marketplace"]' },
  { categorie: 'centre_commercial', filtre: '["shop"="mall"]' },
  { categorie: 'monument', filtre: '["historic"~"^(monument|memorial)$"]' },
  { categorie: 'monument', filtre: '["tourism"="attraction"]' },
  { categorie: 'lieu_culte', filtre: '["amenity"="place_of_worship"]' },
  // À Dakar on se repère aux arrêts : « Scat Urbam » n'existe dans OSM que
  // comme arrêt de BRT, et c'est pourtant le nom que tout le monde tape.
  { categorie: 'arret', filtre: '["highway"="bus_stop"]' },
];

/**
 * Alias que personne n'a mis dans OSM mais que tout le monde tape.
 *
 * Volontairement court : on n'invente pas des noms d'usage depuis un bureau. On
 * met ceux dont on est sûr, et le terrain complétera.
 */
const ALIAS_CHOISIS = [
  [/blaise.diagne/i, ['AIBD', 'Aeroport Diass', 'Nouvel aeroport']],
  [/ancien aeroport|leopold.sedar.senghor/i, ['LSS', 'Ancien aeroport', 'Yoff aeroport']],
  [/monument de la renaissance/i, ['Mamelles', 'La statue']],
  [/massalikoul/i, ['Massalik', 'Grande mosquee Massalikoul']],
  [/sea plaza/i, ['Sea Plaza']],
  [/stade abdoulaye wade/i, ['Stade du Senegal', 'Diamniadio stade']],
  [/leopold sedar senghor.*stade|stade leopold/i, ['Stade Senghor', 'Stade de l amitie']],
  [/^gare de dakar$|gare ferroviaire de dakar/i, ['Gare TER', 'TER Dakar']],
];

function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

const echapper = (t) => t.replace(/'/g, "''");

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Overpass est un bien commun, et il le fait savoir : il répond 429 quand on
 * tape trop vite. On attend, et on recommence — trois fois, en doublant.
 */
async function interroger(filtre, essai = 1) {
  const requete = `
[out:json][timeout:180];
(
  node${filtre}["name"](${BBOX});
  way${filtre}["name"](${BBOX});
  relation${filtre}["name"](${BBOX});
);
out center tags;
`;
  const reponse = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Sans lui, Overpass répond 406.
      'User-Agent': 'flex-sn/0.1 (extraction unique de seed)',
    },
    body: new URLSearchParams({ data: requete }).toString(),
  });
  if (reponse.status === 429 || reponse.status === 504) {
    if (essai > 4) throw new Error(`Overpass ${reponse.status} sur ${filtre}`);
    const attente = 8000 * essai;
    console.error(`  Overpass ${reponse.status}, nouvelle tentative dans ${attente / 1000} s`);
    await dormir(attente);
    return interroger(filtre, essai + 1);
  }
  if (!reponse.ok) throw new Error(`Overpass ${reponse.status} sur ${filtre}`);
  const { elements } = await reponse.json();
  return elements ?? [];
}

/** node < way < relation : on garde le tracé, dont le centroïde vaut mieux. */
const RANG = { node: 0, way: 1, relation: 2 };

const retenus = new Map();

for (const { categorie, filtre } of CATEGORIES) {
  const elements = await interroger(filtre);

  for (const e of elements) {
    const nom = (e.tags?.name ?? '').trim();
    if (!nom) continue;

    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const cle = `${categorie}|${normaliser(nom)}`;
    const existant = retenus.get(cle);
    if (existant && RANG[existant.type] >= RANG[e.type]) continue;

    const alias = [
      e.tags['alt_name'],
      e.tags['name:fr'],
      e.tags['short_name'],
      e.tags['old_name'],
      e.tags['brand'],
    ]
      .filter(Boolean)
      .flatMap((v) => String(v).split(';'))
      .map((v) => v.trim())
      .filter((v) => v && normaliser(v) !== normaliser(nom));

    for (const [motif, ajouts] of ALIAS_CHOISIS) {
      if (motif.test(nom)) alias.push(...ajouts);
    }

    retenus.set(cle, {
      type: e.type,
      categorie,
      nom,
      lat,
      lon,
      alias: [...new Set(alias)],
    });
  }

  console.error(`  ${categorie.padEnd(18)} ${String(elements.length).padStart(5)} éléments`);
  await dormir(3000);
}

const lieux = [...retenus.values()].sort(
  (a, b) => a.categorie.localeCompare(b.categorie) || a.nom.localeCompare(b.nom, 'fr'),
);

const parCategorie = lieux.reduce((acc, l) => {
  acc[l.categorie] = (acc[l.categorie] ?? 0) + 1;
  return acc;
}, {});

console.log('-- Quartiers et points stratégiques de Dakar, extraits d\'OpenStreetMap.');
console.log('-- Données © contributeurs OpenStreetMap, sous ODbL.');
console.log('-- Généré par scripts/extraire-lieux-osm.mjs — ne pas éditer à la main');
console.log('-- sans reporter la correction dans le script.');
console.log(`-- Emprise ${BBOX}. ${lieux.length} lieux :`);
for (const [c, n] of Object.entries(parCategorie).sort()) {
  console.log(`--   ${c.padEnd(18)} ${String(n).padStart(4)}`);
}
console.log('');
console.log('insert into public.lieux (code, nom, alias, categorie, lat, lon) values');

const codeDe = (l) =>
  `${l.categorie[0]}-${normaliser(l.nom).replace(/ /g, '-')}`.slice(0, 60);

console.log(
  lieux
    .map(
      (l) =>
        `  ('${echapper(codeDe(l))}', '${echapper(l.nom)}', ` +
        `array[${l.alias.map((a) => `'${echapper(a)}'`).join(', ')}]::text[], ` +
        `'${l.categorie}', ${l.lat.toFixed(6)}, ${l.lon.toFixed(6)})`,
    )
    .join(',\n'),
);
console.log('on conflict (code) do nothing;');

console.error(`${lieux.length} lieux extraits`);
for (const [c, n] of Object.entries(parCategorie).sort()) console.error(`  ${c} : ${n}`);
