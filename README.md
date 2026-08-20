# Flex

Application de transport avec **négociation directe du prix** entre passager et conducteur, au Sénégal.

Le passager propose un montant. Les conducteurs à proximité acceptent, refusent ou contre-proposent.
Le passager choisit selon le prix, le délai d'arrivée, la note et le véhicule.

---

## Statut : V1 code-complète

Les cinq écrans du parcours existent, se tiennent, et le trajet complet passe de bout en
bout **sur le projet distant, avec deux vraies sessions** — voir `docs/parcours-v1.md`.

| | |
|---|---|
| Écrans | Accueil · Fixez votre prix · Offres reçues · Mode conducteur · En route · Profil · Mon profil · Conduire avec Flex · Connexion (numéro, code, prénom) · À propos |
| Base | 42 migrations, **275 assertions pgTAP**, RLS sur chaque table, logique métier en RPC |
| Gardes | `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm tokens:check` (44 paires) · `supabase test db` · `node scripts/parcours-v1.mjs` |
| Étiquette | `v1.0.0-dev` |

Code-complète ne veut pas dire lançable : le tableau ci-dessous liste ce qui manque, et
rien de ce qui y figure ne se règle dans l'application.

## Bloquants de lancement

Aucun ne se contourne par du code applicatif. Tant qu'une ligne reste ouverte, on ne
publie pas.

| Bloquant | Ce qui se passe sans | Où |
|---|---|---|
| **Fournisseur SMS (Twilio)** | L'authentification est en OTP téléphone. Sans fournisseur configuré dans Auth → Providers → Phone, personne n'ouvre de session en production. | Console Supabase |
| **Supprimer `dev@flex.test` et `essai-route@flex.test`** | Deux comptes de développement, mots de passe en clair dans `src/lib/sessionDev.ts` et `scripts/parcours-v1.mjs`. Ils n'ont rien à faire sur une base ouverte. | Projet distant |
| **Back-office de modération** | `decider_document()` est réservée à `service_role` : valider une pièce se fait aujourd'hui par une requête SQL. Tenable pour les dix premiers conducteurs, pas au-delà. | Premier chantier après-V1 |
| **Vérification humaine des dossiers** | Le selfie doit être comparé à la pièce par quelqu'un. Le schéma le permet, personne ne le fait encore. | Opérations |
| **Empreinte SHA-1 de développement (Google Maps)** | La clé Android est restreinte au SHA-1 du keystore de production. En dev, Expo signe avec un keystore de debug : carte grise sur Android tant que la seconde empreinte n'est pas ajoutée. | Console Google Cloud |
| **Protection contre les mots de passe compromis** | Signalée par les advisors. La production passe par OTP, mais tant que l'authentification par mot de passe reste ouverte, elle doit l'être. | Auth → Policies |
| **Entité sénégalaise (NINEA + RCCM)** | Obligatoire pour tout compte marchand. Bloque le paiement, donc la monétisation. | Hors code |
| **Blocage réciproque entre utilisateurs** | Rien ne permet à quelqu'un de ne plus jamais croiser quelqu'un d'autre. | Schéma + écran |
| **Évaluations en double aveugle, retrait d'un avis abusif** | Le double aveugle existe en base ; le retrait d'un avis, non. | Back-office |

Deux points **ne sont pas** des bloquants, et sont documentés comme voulus : les
signalements d'advisors listés plus bas, et l'attribution OpenStreetMap — elle est en
place, dans l'écran **À propos**.

## Après la V1

Dans cet ordre, et pas avant :

1. **Back-office** — modération des dossiers conducteur, support, retrait d'avis. C'est
   lui qui débloque le passage à l'échelle des inscriptions.
2. **OSRM auto-hébergé** — distances et durées par la route, à la place du vol d'oiseau
   × 1,3. Le prix recommandé et l'ETA en dépendent tous les deux. Auto-hébergé parce que
   Directions est facturé à l'appel, et que la règle « affichage seul » ne bouge pas.
3. **Nominatim auto-hébergé** — recherche d'adresse réelle, à la place des 1 498 lieux
   extraits une fois pour toutes. Même raison : Geocoding est facturé, Nominatim non.
4. **Pricing interurbain** — corridors à prix d'usage. Un Dakar–Touba a un prix que tout
   le monde connaît, pas un prix au kilomètre. `events_prix` accumule déjà de quoi le
   calibrer.
5. **Paiement** — après l'entité et le compte marchand, pas avant.
6. **Notifications push** — une offre qui arrive quand l'application est fermée. Impose
   une dépendance native et une reconstruction du client.

### Les pages au backlog

Aucune n'empêche de se servir de l'application. Dans cet ordre :

1. **Historique des courses.** `rides` n'est lu que pour la course active : ni le
   passager ni le conducteur ne peuvent voir ce qu'ils ont fait. Côté conducteur c'est
   le complément direct de la carte de gains — « 4 400 FCFA cette semaine » appelle
   « lesquelles ».
2. **Mes avis.** `evaluations_visibles` est construite, commentée, testée, avec sa règle
   de double aveugle — et lue par aucun écran. La note s'affiche, les avis qui la
   composent restent invisibles, y compris pour celui qui les a reçus.
3. **Messagerie interne.** « Écrire » passe par le SMS du téléphone en V1 — les numéros
   se voient donc entre passager et conducteur d'une course acceptée. C'est la seule
   exposition volontaire du produit, et elle est en contradiction avec tout le reste du
   schéma, qui ne sert un numéro qu'à la contrepartie d'une course active et jamais
   avant. La messagerie interne est prévue pour la fermer.

---

## Périmètre de la V1 — strict

Deux services, rien d'autre :

1. **Trajet urbain** — Dakar métropole. Le passager fixe son prix en FCFA.
2. **D'une ville à l'autre** — interurbain au départ de Dakar (Thiès, Mbour/Saly, Touba, Saint-Louis, Kaolack, Ziguinchor).

Hors périmètre V1, à ne pas construire : colis, fret, moto, repas, abonnements, parrainage.

---

## Stack

| Couche | Choix |
|---|---|
| Application | React Native + Expo (SDK récent), TypeScript strict |
| Navigation | expo-router |
| Styles | NativeWind v4 (Tailwind), thèmes clair et sombre |
| Base de données | Supabase — Postgres, RLS, Realtime, Edge Functions |
| Auth | Supabase Auth, OTP par téléphone |
| Cartes | react-native-maps avec `PROVIDER_GOOGLE`, **affichage seul** |
| Langues | i18n, `fr` par défaut, `en` disponible, `wo` préparé non rempli |
| Paiement | Wave en direct, PayDunya en second canal (Orange Money) |
| Retours | expo-haptics sur les actions de prix et d'acceptation |

---

## Ce qui est décidé

- **Incréments de prix : 100 FCFA.** C'est l'unité réelle de la monnaie.
- **Le conducteur voit le prix proposé avant d'accepter.** Aucun prix imposé par un algorithme.
- **L'ambre est réservé aux montants.** Un statut ne s'écrit jamais en ambre.
- **Chaque couleur d'accent a deux jetons** : un pour remplir, un pour écrire. Voir `docs/design.md`.
- **Le paiement réel arrive en dernier.** Tant que le compte marchand n'existe pas, « Payer » passe sans transaction.
- Cartes en affichage seul : jamais Places, Directions ni Geocoding facturés.
- **La recommandation de prix est un MINIMUM, pas un milieu.** L'écran écrit
  « Recommandé à partir de 2 100 F » — jamais « suggéré », jamais « environ ». Le
  passager peut la proposer telle quelle ou la dépasser ; les bornes de
  `bornes_prix` restent le garde-fou serveur. La recommandation est une aide, la
  borne est une loi.
- **Pas de tarification dynamique. La négociation EST le mécanisme d'ajustement.**
  Aucun multiplicateur d'heure, de météo ou de demande : quand ça bouchonne, les
  conducteurs contre-proposent plus haut, et c'est exactement ce que le produit sait
  faire. Un coefficient horaire ne sera envisagé que mesuré sur nos propres données,
  jamais deviné.

## Ce qui reste à trancher

- Commission : sur le passager, sur le conducteur, ou les deux.
- Zone de lancement : Dakar entier ou un corridor unique.
- **Pricing interurbain — reporté après V1** (voir la feuille de route). En attendant,
  `prix_suggere()` rend NULL sur l'interurbain, le champ s'ouvre vide et exige une
  saisie : mieux vaut ne rien recommander qu'un chiffre au kilomètre là où tout le
  monde connaît le prix d'usage.

_(Le toggle Passager/Conducteur est tranché : plateforme uniforme, conduire est une
capacité et non un type de compte. Voir `20260819090100_capacite_conducteur.sql`.)_

---

## Chemin critique — hors code

Ces éléments bloquent le lancement plus sûrement que le développement :

1. Entité sénégalaise — NINEA + RCCM (obligatoire pour tout compte marchand)
2. Compte marchand Wave Business
3. Cadre VTC : un décret d'encadrement est en préparation au Sénégal. Provisionner un
   ticket d'entrée éventuel.
4. Recrutement des premiers conducteurs — sans eux, aucune offre ne revient et le produit ne
   démontre rien.

---

## Démarrage

```bash
pnpm install
cp .env.example .env      # renseigner Supabase et la clé Google Maps
pnpm start
```

## Base de données

Tout se joue en local tant que le schéma n'est pas stable. Rien n'est poussé sur le projet
distant.

```bash
pnpm db:start   # Postgres + Auth + Realtime en conteneurs (ports 546xx)
pnpm db:reset   # rejoue toutes les migrations à neuf
pnpm db:test    # pgTAP
pnpm db:lint
pnpm db:types   # régénère src/lib/database.types.ts
```

Migrations en ajout seul. Aucune table n'accorde `insert`, `update` ni `delete` au client :
tout passe par les fonctions RPC. Trois vues en projection de colonnes servent ce qu'un
conducteur a le droit de voir avant acceptation — la RLS filtre des lignes, pas des colonnes.

**`expire_stale()` est planifiée par `pg_cron`, toutes les minutes.** La migration
`20260819090400_cron_expire_stale.sql` pose la tâche là où l'extension existe — c'est le cas
en local, l'image Supabase la précharge — et se contente d'un `notice` ailleurs. Sur le projet
distant, la planification ne commence qu'une fois la migration appliquée là-bas.

**PostGIS sert à l'appariement, pas à l'affichage.** Il tourne dans la base : ce n'est pas une
API facturée, et la règle « ni Places, ni Directions, ni Geocoding » n'est pas concernée. Les
noms de quartier viennent d'une table locale de communes, jamais d'un reverse geocoding.

## Ce que les advisors signalent et qu'on ne corrigera pas

`supabase advisors` remonte ces points sur le projet distant. Ce sont des **décisions
d'architecture**, pas des oublis. Ne les « réparez » pas — les tests de
`supabase/tests/080_confidentialite.sql` prouvent que la confidentialité tient.

| Signalement | Pourquoi c'est voulu |
|---|---|
| `security_definer_view` sur `profils_publics`, `vehicules_publics`, `demandes_ouvertes`, `offres_recues`, `evaluations_visibles` | La RLS filtre des **lignes**, pas des **colonnes**. La confidentialité de Flex est une affaire de colonnes : un conducteur a le droit de savoir qu'une demande existe, pas qui la pose. Ces vues contournent la RLS mais ne projettent que le non-confidentiel. |
| `security_definer_view` sur `mes_gains` | Cas à part, et volontaire : la vue porte `where conducteur_id = auth.uid()` **dans sa définition**. Le filtre ne peut donc pas être oublié côté client — c'est exactement l'inverse d'une fuite. |
| `rls_enabled_no_policy` sur `events_prix` | Voulu, et c'est le verrou : RLS active, **aucune** policy, `select` accordé au seul `service_role`. Le journal de calibrage tarifaire n'est lisible par personne d'autre — pas même par celui qui vient d'en provoquer une ligne. |
| `authenticated_security_definer_function_executable` sur les RPC | C'est toute l'architecture : aucune table n'accorde d'écriture au client, tout passe par ces fonctions. Leur retirer `execute` fermerait l'application. `expire_stale()` n'est **pas** dans la liste — elle est réservée à `service_role`, et c'est vérifié. |

Côté performance, trois remontées `INFO` restent, et resteront tant que la base est vide :

| Signalement | Pourquoi c'est voulu |
|---|---|
| `unused_index` sur les index GiST (`ride_requests_*_geo`, `positions_conducteurs_geo`, `lieux_geo`) | Ils ne servent pas parce qu'il n'y a pas encore de trafic. Les retirer serait les recréer au premier millier de courses, sur une table chaude. |
| `unindexed_foreign_keys` sur `offers.vehicule_id`, `rides.vehicule_id`, `rides.annulee_par`, `evaluations.auteur_id` | Aucune lecture ne part de ces colonnes. Un index qu'on ne lit jamais se paie à chaque écriture. Ceux qui SERVENT ont été posés — voir `20260820190000_index_courses.sql`. |
| `multiple_permissive_policies` | Deux policies par table, et c'est le dessin : « la mienne » et « celle de ma contrepartie pendant une course active ». Les fusionner en une seule expression rendrait la règle de confidentialité illisible, donc fausse au premier changement. |

Toute autre remontée est un vrai défaut et se corrige.

## Pièges connus, et ce qu'ils coûtent

Ce ne sont pas des bloquants : ce sont les endroits où quelqu'un va perdre une demi-journée
s'il ne le sait pas.

- **Google Maps ne s'affiche pas dans Expo Go sur iOS.** Expo Go n'embarque pas le SDK
  natif Google Maps : y demander `PROVIDER_GOOGLE` ne rend rien du tout. L'application
  retombe donc sur le fournisseur du système quand elle tourne dans Expo Go — la carte
  fonctionne, mais `customMapStyle` ne s'applique qu'à Google, donc **les jetons de thème
  ne colorent pas la carte tant qu'on développe dans Expo Go**. Un build de développement
  (`npx expo run:ios` ou un profil EAS `development`) affiche Google et la palette avec.
  C'est le seul endroit où développement et production diffèrent volontairement.
- **Le keystore de production ne doit jamais entrer dans le dépôt.** `.gitignore` couvre
  `*.jks`, `*.keystore` et `credentials.json`.
- **Session de développement sans OTP.** Le panneau de dev ouvre une session par mot de
  passe — voir `src/components/PanneauDev.tsx` et `src/lib/sessionDev.ts`. C'est la seule
  échappatoire à l'absence de fournisseur SMS, et elle est `__DEV__` seulement.
- **L'attribution OpenStreetMap est en place**, dans l'écran À propos : « © contributeurs
  OpenStreetMap », lien vers `openstreetmap.org/copyright`, mention ODbL. La table `lieux`
  en vient tout entière — voir `docs/extraction-lieux.md`. Ne pas la retirer : c'est une
  obligation de licence, pas une politesse.

## Gardes

```bash
pnpm tokens:check          # échoue si une paire texte/fond passe sous 4,5:1, dans les deux thèmes
pnpm typecheck
pnpm lint
supabase test db --local   # 275 assertions pgTAP
node scripts/parcours-v1.mjs   # le parcours complet sur le DISTANT, deux sessions
```

Le parcours de bout en bout est décrit écran par écran dans `docs/parcours-v1.md`.
