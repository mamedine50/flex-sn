# Extraction des lieux depuis OpenStreetMap

## Ce que c'est

`scripts/extraire-lieux-osm.mjs` interroge l'API Overpass **une fois** et produit
`supabase/seed/lieux.sql`. Le fichier est versionné, relu, et chargé par
`supabase db reset`.

**L'application n'appelle jamais OpenStreetMap ni aucun service de lieux.** Elle lit
la table locale, et le filtrage de la recherche se fait en mémoire sur le téléphone.

## Rejouer l'extraction

```bash
node scripts/extraire-lieux-osm.mjs > supabase/seed/lieux.sql
```

Relire le diff avant de committer : OSM bouge, et une extraction qui perd cent
quartiers d'un coup est une extraction ratée, pas une évolution du terrain.

Overpass répond **406** sans en-tête `User-Agent` et **429** quand on tape trop vite ;
le script pose les deux et réessaie en doublant l'attente.

## Ce que ça contient

| Catégorie | Nombre | Source OSM |
|---|---|---|
| lieu_culte | 378 | `amenity=place_of_worship` |
| arret | 206 | `highway=bus_stop` |
| universite | 186 | `amenity=university`, `college` |
| quartier | 181 | `place=neighbourhood\|suburb\|quarter` |
| hotel | 174 | `tourism=hotel` |
| hopital | 156 | `amenity=hospital`, `clinic` |
| marche | 74 | `amenity=marketplace` |
| gare | 61 | `bus_station`, `railway=station`, `ferry_terminal` |
| monument | 47 | `historic=monument\|memorial`, `tourism=attraction` |
| stade | 16 | `leisure=stadium` |
| centre_commercial | 15 | `shop=mall` |
| aeroport | 4 | `aeroway=aerodrome` |

Emprise : `14.40,-17.60,14.95,-16.95` — la région de Dakar élargie à l'est pour
englober l'**AIBD** (14,67 / -17,07), qui est hors région administrative mais qu'on
cherche évidemment.

## Ce que l'extraction a appris

- **« Scat Urbam » n'existe pas comme quartier dans OSM.** Il n'existe que comme
  arrêt de BRT. C'est pourquoi `highway=bus_stop` est une catégorie à part entière :
  à Dakar on se repère aux arrêts, pas aux limites administratives.
- **L'AIBD s'appelle « Blaise-Diagne » avec un trait d'union.** Une recherche sur
  « Blaise Diagne » ne le trouvait pas — d'où les alias choisis à la main dans le
  script, pour la poignée de lieux dont on connaît le nom d'usage avec certitude.
- **Le `todo` du Plateau reposait sur une prémisse fausse.** Le point 14,6928 /
  -17,4467 est à 292 m de Colobane et à 2 985 m de Dakar-Plateau, qu'OSM place à
  14,6673. Ce n'étaient pas nos centroïdes qui étaient mauvais, c'était l'attente.
  Les deux assertions de `110_communes.sql` portent désormais les bonnes
  coordonnées, et le `todo` a disparu.

## Confidentialité

Rien de cette table n'est servi au conducteur avant acceptation. Un passager qui part
du Radisson Blu apparaît **« vers Almadies »**, point. Deux assertions de
`080_confidentialite.sql` le vérifient : aucune colonne de lieu dans
`demandes_ouvertes`, et aucune dépendance de la vue envers la table `lieux`.

## Licence

Données © contributeurs OpenStreetMap, sous **ODbL**. L'attribution doit figurer dans
l'application avant toute publication — c'est un bloquant de lancement.
