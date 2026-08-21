# CLAUDE.md

Règles permanentes de ce dépôt. À lire avant toute modification.

---

## Langue

- L'interface est en **français par défaut**, anglais disponible, wolof préparé mais vide.
- Le code, les commentaires et les commits sont en français.
- Aucune chaîne en dur dans un composant. Tout passe par `src/i18n`.
- Une clé absente affiche `⛔ clé` en développement, **jamais la clé nue en production**.

## Couleurs

- Aucun hex en dur dans un composant. Uniquement les jetons de `src/theme/tokens.ts`.
- **Un jeton de remplissage n'est jamais un jeton d'encre.** `accFill` remplit, `accInk` écrit.
- **L'ambre appartient aux montants.** Tout montant s'écrit en `moneyInk`. Un statut
  ne s'écrit JAMAIS en ambre. Il s'écrit en `accInk` ou `ok` — sauf « contre-offre »,
  qui s'écrit en `danger`. L'exception est délibérée : sur l'écran des offres, la
  seule question qui compte est « ce conducteur a-t-il accepté mon prix, ou en
  demande-t-il un autre ? ». Deux nuances de vert ne la posent pas ; deux couleurs
  opposées, si. Le rouge n'y dit pas « erreur », il dit « ce n'est pas ce que vous
  aviez proposé » — et c'est la seule chose que l'œil doit attraper avant d'appuyer.
- **Un aplat de couleur qui porte une information sur une carte ou une surface claire
  reçoit un contour de 2 px en `shapeOutline`.** Point de carte, marqueur, pastille de
  statut, badge de prix. L'ambre sur fond clair est à 1,95:1 : c'est le contour qui rend
  la forme identifiable, pas l'aplat. On n'assombrit pas `moneyFill` pour compenser —
  l'ambre est la couleur de l'argent, elle doit rester reconnaissable.
- En mode sombre, l'élévation se fait par la **clarté** du fond, jamais par une ombre.
- `pnpm tokens:check` doit passer sur les deux thèmes avant tout commit. Il vérifie deux
  listes à deux seuils : `contrastPairs` (texte, 4,5:1) et `shapePairs` (formes, 3:1).
  Une forme n'est pas un texte ; y forcer 4,5:1 assombrirait des couleurs qui n'en ont
  pas besoin. N'entrent dans `shapePairs` que les formes porteuses d'information — ni
  bordures ni séparateurs, qui échoueraient tous et tueraient la garde par exceptions.

## Chiffres

- `font-variant-numeric: tabular-nums` sur **tout montant susceptible de changer**.
  Sans ça le prix tressaute à chaque appui sur `+` et l'app paraît cassée.
- Format identique dans toutes les langues : espace insécable comme séparateur de milliers,
  `FCFA` suffixé après une espace → `2 500 FCFA`. Jamais `2,500`.
- Heures en 24 h dans toutes les locales.
- Les incréments de prix sont de **100 FCFA**.

## Argent

- Toute somme est stockée en **entier XOF**. Jamais de flottant, jamais de centimes.
- Le calcul du montant se fait en base, jamais côté client seul. Si une règle existe des deux
  côtés, elle est testée en parité.

## Base de données

- Chaque table a des policies RLS. Aucun `grant` sur table sans réflexion : un `grant` de table
  contourne les fonctions.
- Toute logique métier passe par des fonctions Postgres appelées en RPC, pas par des `insert`
  directs depuis le client.
- Migrations en **ajout seul**. On ne modifie jamais une migration déjà appliquée.
- Changer le type de retour d'une fonction = `drop` + `create` = **re-grant obligatoire**, plus
  une assertion d'appel par un rôle non-propriétaire. Invisible en local, casse en staging.
- Tests pgTAP sur chaque fonction, y compris les cas de concurrence.
- **Changer le RÉGLAGE d'une fonction se fait par `alter function ... set`, jamais par
  `create or replace`.** Une colonne générée stockée dépend du CORPS de la fonction
  qu'elle appelle : la remplacer est une opération qu'on ne fait pas pour poser un
  `search_path`. `alter function` ne touche qu'au réglage et laisse le corps — et donc
  la colonne — intacts. Le piège ne se voit qu'une fois qu'il a cassé quelque chose.
- Toute fonction porte `set search_path = ''` et qualifie ses noms. Sans ça, sa
  résolution dépend de l'appelant — et une fonction appelée depuis une colonne générée
  ou depuis une vue qui contourne la RLS est le pire endroit pour ça.
- **Realtime déclenche, il ne fait pas foi.** Un événement provoque une RELECTURE, jamais
  une mise à jour de l'état local à partir de la charge utile. Trois raisons : la charge
  utile porte la ligne d'`offers`, pas le prénom du conducteur ni son véhicule — il faut
  aller les chercher de toute façon ; le canal se ferme quand l'application passe en
  arrière-plan et les événements de l'intervalle ne sont jamais rejoués ; et un état
  reconstruit par accumulation diverge du serveur dès qu'un seul événement manque, sans
  que rien ne le signale. On relit donc aussi au retour au premier plan ET à l'ouverture
  de session — une session qui s'ouvre change ce que la RLS laisse voir.
- **Les droits par défaut de Supabase accordent `EXECUTE` à `anon` et `authenticated`
  sur toute fonction créée dans `public`.** Chaque nouvelle fonction choisit donc
  EXPLICITEMENT ses exécutants : `revoke all ... from public, anon, authenticated`
  puis `grant execute` à qui de droit. Y compris les fonctions de déclencheur et les
  utilitaires, qui n'ont aucune raison d'être appelables. L'inventaire de
  `supabase/tests/010_schema.sql` ferme la porte par défaut : la liste blanche `anon`
  est vide, celle d'`authenticated` est nommée fonction par fonction.
- **Une fonction appelée depuis une VUE ou une POLICY est vérifiée contre celui qui
  interroge**, pas contre le propriétaire — même pour une vue en
  `security_invoker = false`, qui ne protège que l'accès aux tables. Ces fonctions-là
  ont donc besoin d'un `grant execute` explicite. Le défaut est LATENT : tant que le
  filtre de la vue rend zéro ligne, la fonction n'est jamais évaluée et tout paraît
  fonctionner.
- **Les advisors Supabase font partie des gardes.** On les relit après chaque série de
  migrations appliquées sur le distant, et on note ce qui reste comme délibéré. Ce qui
  est délibéré aujourd'hui est listé dans le README — on ne le « répare » pas.

## Négociation — les règles qui comptent

- Une demande a une **expiration**. Passé le délai, elle ne peut plus recevoir d'offre.
- Une offre acceptée verrouille la demande : les autres offres deviennent caduques.
  L'acceptation concurrente est testée — deux passagers ne peuvent pas verrouiller le même conducteur.
- Un conducteur ne peut pas voir le nom complet ni le numéro du passager avant acceptation.
- La position exacte du passager n'est servie qu'après acceptation. Avant, zone approximative.
- **Un lieu favori a deux noms.** Le nom privé — « Domicile », « chez maman » — et la
  précision qui l'accompagne ne sont lisibles que par leur propriétaire. Le serveur et
  les autres ne voient jamais qu'un libellé neutre. On ne floute pas un point pour
  nommer la porte juste après. `destination_libelle` est servi au conducteur : c'est là
  que la règle se joue, et `lieuDepuisFavori()` est le seul chemin autorisé.
- **Vingt lieux favoris par personne.** Au-delà ce n'est plus une liste de raccourcis,
  c'est un annuaire — et un annuaire de domiciles est une donnée qu'on ne veut pas
  détenir.

## Performance

Budget non négociable, cible Android d'entrée de gamme en 3G :

- APK sous 30 Mo
- Premier écran utile sous 2 s — pas d'écran de démarrage animé
- La carte se charge **après** l'accueil, importée par sous-chemin, jamais depuis un barrel
- Skeletons, jamais de spinner
- Les images sont redimensionnées à 1200 px avant envoi — `quality` seul ne réduit pas les dimensions
- Mouvement limité à l'arrivée des offres, 180 ms, `prefers-reduced-motion` respecté

## Cartes

- Affichage seul. **Jamais** Places, Directions ou Geocoding — ce sont des appels facturés.
- `initialRegion`, jamais `region`.
- Clés restreintes : iOS par bundle, Android par SHA-1. Une clé mal restreinte affiche une carte
  grise sans message d'erreur.

## Lieux

- Un nom de commune vient d'une table locale de centroïdes **approximatifs**, jamais d'un
  reverse geocoding. L'interface ne l'annonce donc jamais sèchement : elle écrit
  **« vers Plateau »**, pas « Plateau ». Le mot de couverture coûte zéro et évite de
  présenter une approximation comme un fait. Clé `conducteur.versCommune`.
- La règle tombe le jour où les polygones réels des communes remplacent les centroïdes —
  le test `todo` de `supabase/tests/110_communes.sql` passera au vert ce jour-là.

## Interface — gabarit

- **Toute géométrie (hauteur, largeur, marge, espacement, rayon) passe par des classes
  NativeWind.** Jamais par `style` inline à côté d'un `className` : NativeWind l'ignore
  sans avertissement. Seules exceptions, les valeurs calculées au runtime qui n'ont pas
  de classe — zone sûre, dimensions mesurées.
- **Toute valeur de géométrie hors échelle est ignorée par NativeWind, sans
  avertissement.** L'échelle de `src/theme/tokens.ts` — 4, 8, 12, 16, 24, 32, 48 — est la
  seule source. `h-40` ne fait pas 40 px : il ne fait RIEN, la pastille disparaît, et la
  revue de code ne voit qu'une classe qui a l'air juste. Ce qui n'y est pas s'écrit entre
  crochets, `h-[92px]`, jamais approximé sur la valeur voisine. L'assertion de gabarit est
  le filet : c'est elle qui a attrapé les deux cas.
- **Une capture prouve un appareil un jour donné. Une assertion mesurée prouve la règle
  partout.** Tout écran à gabarit contraint porte son assertion, exécutée sous `__DEV__`
  à chaque lancement. Voir `src/lib/gabarit.ts`.
- **Un état désactivé change de COULEUR, pas seulement d'opacité.** Un aplat clair à
  50 % reste lumineux sur fond sombre, et le contrôle a l'air actif : on appuie, rien ne
  se passe, on croit l'application cassée. Fond en `card2`, texte en `muted`.
- Les états qu'on ne sait pas déclencher se forcent par `src/components/PanneauDev.tsx`,
  appui long, `__DEV__` seulement. Un état qu'on ne sait pas déclencher est un état qu'on
  n'a pas.
- Ni le panneau de développement ni les assertions ne passent par `src/i18n` : ils ne
  sont pas l'interface et ne seront jamais traduits.

## Écriture d'interface

- Voix active. Un bouton dit ce qui se passe : « Envoyer ma proposition », pas « Soumettre ».
- Un mot garde son sens d'un bout à l'autre : « Accepter » produit « Offre acceptée ».
- Les erreurs disent ce qui s'est passé et quoi faire. Elles ne s'excusent pas.
- Un écran vide est une invitation à agir.

## À ne pas faire sans demande explicite

- Ajouter un service hors périmètre V1 (colis, fret, moto, repas)
- Brancher un vrai paiement avant que le compte marchand existe
- Introduire une dépendance native sans le signaler : elle impose une reconstruction du client
