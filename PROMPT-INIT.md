# Prompt d'initialisation — à coller dans Claude Code

> Colle ce bloc tel quel. `README.md`, `CLAUDE.md` et `src/theme/tokens.ts` sont déjà à la racine.

---

Tu es développeur senior React Native. Nous initialisons **Flex**, une application de transport
avec négociation directe du prix, pour le Sénégal.

**Lis d'abord `README.md`, `CLAUDE.md` et `src/theme/tokens.ts`.** Ils font autorité : en cas de
contradiction avec ce message, ce sont eux qui gagnent. Ne réécris aucun des trois.

## Étape 1 — Fondations uniquement

Ne génère aucun écran à cette étape.

1. Projet Expo + TypeScript strict + expo-router + NativeWind v4.
2. `tailwind.config.js` qui lit `src/theme/tokens.ts` — aucune couleur redéclarée en dur.
3. `src/theme/ThemeProvider.tsx` : thème suivant le réglage système, bascule manuelle
   persistée, hook `useTheme()` rendant les jetons du thème actif.
4. `src/i18n/` : `fr.ts` (rempli), `en.ts` (rempli), `wo.ts` (structure vide). `fr` par défaut,
   pas de détection automatique qui imposerait l'anglais. Une clé absente rend `⛔ clé` en
   développement.
5. `formatXof(n)` → `2 500 FCFA` avec espace insécable, identique dans toutes les langues.
   Tests unitaires.
6. Script `pnpm tokens:check` : parcourt `contrastPairs` de `tokens.ts`, calcule le ratio WCAG
   dans **les deux thèmes**, sort en erreur sous 4,5:1. Branché en CI.
7. `.env.example` : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `EXPO_PUBLIC_GOOGLE_MAPS_KEY`.

Arrête-toi ici et montre-moi l'arborescence avant de continuer.

## Étape 2 — Schéma de base

Supabase. Migrations en ajout seul, RLS sur chaque table, logique métier en fonctions Postgres
appelées en RPC. Tests pgTAP.

Tables minimales :

- `profiles` — utilisateur, rôle, note moyenne, langue
- `vehicles` — véhicule d'un conducteur, plaque, modèle, couleur
- `ride_requests` — départ, destination, `price_xof` (entier), `service` (`urbain` |
  `interurbain`), `expires_at`, statut
- `offers` — une réponse de conducteur à une demande : `accepted` ou `counter` avec
  `price_xof`, plus `expires_at`
- `rides` — la course verrouillée après acceptation, avec le prix convenu

Fonctions à écrire, chacune testée :

- `create_ride_request()` — pose l'expiration, refuse un prix hors bornes
- `submit_offer()` — refuse si la demande est expirée ou déjà verrouillée
- `accept_offer()` — **verrouille en transaction**. Un test doit prouver que deux acceptations
  concurrentes sur le même conducteur n'en laissent passer qu'une.
- `expire_stale()` — passe les demandes et offres échues

Règles de confidentialité à respecter dans les policies :

- Un conducteur ne voit ni le nom complet ni le numéro du passager avant acceptation.
- La position exacte du passager n'est servie qu'après acceptation. Avant : zone approximative
  arrondie de façon **stable** (pas de bruit aléatoire — une moyenne trahirait le centre).

Realtime sur `offers` pour que le passager voie les réponses arriver.

Arrête-toi et montre-moi le schéma avant les écrans.

## Étape 3 — Écrans

Dans cet ordre, un par un, en t'arrêtant après chacun :

1. **Accueil** — carte en fond, feuille flottante avec deux tuiles (Trajet urbain « Fixez votre
   prix » / D'une ville à l'autre « Trajets interurbains »), barre « Où allez-vous ? ».
2. **Fixez votre prix** — départ, destination, montant en gros avec boutons `−` / `+` de
   **100 F**, fourchette indicative, `expo-haptics` à chaque incrément.
3. **Offres reçues** — liste temps réel : photo, prénom, note, véhicule, délai d'arrivée, prix.
   Prix en `moneyInk`, mention « contre-offre » en `accInk`. Boutons Accepter / Refuser.
4. **Mode conducteur** — demande entrante, prix proposé en gros, trois actions de 56 px :
   Accepter / Contre-proposer / Refuser.
5. **En route** — carte, conducteur, prix convenu visible en permanence, Appeler / Écrire.

## Rappels qui coûtent cher si oubliés

- Chiffres tabulaires sur tout montant qui change.
- Aucun hex en dur : uniquement les jetons.
- Les montants en `moneyInk`, jamais un statut en ambre.
- La carte se charge après l'accueil, importée par sous-chemin.
- Pas de Places, Directions ni Geocoding — affichage seul.
- Toute nouvelle dépendance native : signale-la, elle impose une reconstruction du client.
