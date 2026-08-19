# Flex

Application de transport avec **négociation directe du prix** entre passager et conducteur, au Sénégal.

Le passager propose un montant. Les conducteurs à proximité acceptent, refusent ou contre-proposent.
Le passager choisit selon le prix, le délai d'arrivée, la note et le véhicule.

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

## Ce qui reste à trancher

- Toggle Passager/Conducteur dans l'entête, ou plateforme uniforme sans choix de rôle.
- Commission : sur le passager, sur le conducteur, ou les deux.
- Zone de lancement : Dakar entier ou un corridor unique.

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

## Bloquants avant ouverture publique

À ne pas repousser, ils reviennent toujours plus cher après :

- Vérification des documents conducteur + selfie comparé à la pièce
- Back-office de modération et de support
- Évaluations en double aveugle, retrait d'un avis abusif
- Blocage réciproque entre utilisateurs
- Confidentialité des positions : zone approximative avant acceptation, adresse exacte après

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
| `security_definer_view` sur `profils_publics`, `vehicules_publics`, `demandes_ouvertes` | La RLS filtre des **lignes**, pas des **colonnes**. La confidentialité de Flex est une affaire de colonnes : un conducteur a le droit de savoir qu'une demande existe, pas qui la pose. Ces vues contournent la RLS mais ne projettent que le non-confidentiel. C'est le seul endroit du schéma où la RLS est contournée. |
| `authenticated_security_definer_function_executable` sur les 6 RPC | C'est toute l'architecture : aucune table n'accorde d'écriture au client, tout passe par ces fonctions. Leur retirer `execute` fermerait l'application. `expire_stale()` n'est **pas** dans la liste — elle est réservée à `service_role`, et c'est vérifié. |

Toute autre remontée est un vrai défaut et se corrige.

## Bloquants de lancement

À traiter, ils bloquent l'ouverture au même titre que le compte marchand :

- **Fournisseur SMS.** L'authentification est en OTP téléphone, et Supabase exige un
  fournisseur configuré (Twilio) dans Auth → Providers → Phone. Tant qu'il n'y en a pas,
  personne ne peut ouvrir de session en production. En développement, le panneau de dev
  ouvre une session de test sans OTP — voir `src/components/PanneauDev.tsx`.
- **Google Maps ne s'affiche pas dans Expo Go sur iOS.** Expo Go n'embarque pas le SDK
  natif Google Maps : y demander `PROVIDER_GOOGLE` ne rend rien du tout. L'application
  retombe donc sur le fournisseur du système quand elle tourne dans Expo Go — la carte
  fonctionne, mais `customMapStyle` ne s'applique qu'à Google, donc **les jetons de thème
  ne colorent pas la carte tant qu'on développe dans Expo Go**. Un build de développement
  (`npx expo run:ios` ou un profil EAS `development`) affiche Google et la palette avec.
  C'est le seul endroit où développement et production diffèrent volontairement.
- **Empreinte SHA-1 de développement pour Google Maps.** La clé Android est restreinte
  au SHA-1 du keystore de **production** stocké chez EAS. En développement, Expo signe
  avec un keystore de debug différent : la carte restera grise sur un Android en dev
  tant que cette seconde empreinte n'est pas ajoutée à la même clé. Google en accepte
  plusieurs.
- Le keystore de production ne doit jamais entrer dans le dépôt. `.gitignore` couvre
  `*.jks`, `*.keystore` et `credentials.json`.
- **Supprimer le compte `dev@flex.test`** du projet distant. Il sert au panneau de
  développement pour ouvrir une session sans OTP ; son mot de passe est en clair dans
  `src/lib/sessionDev.ts`. Il n'a rien à faire sur une base ouverte au public.

## Gardes

```bash
pnpm tokens:check   # échoue si une paire texte/fond passe sous 4,5:1, dans les deux thèmes
pnpm typecheck
pnpm lint
```
