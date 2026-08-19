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

## Gardes

```bash
pnpm tokens:check   # échoue si une paire texte/fond passe sous 4,5:1, dans les deux thèmes
pnpm typecheck
pnpm lint
```
