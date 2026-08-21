# Le parcours de référence

C'est la carte maîtresse. Tout écran ajouté à Flex doit s'y insérer sans casser
une seule des transitions décrites ici. Quand un choix d'interface hésite, c'est
ce document qui tranche.

La règle qui gouverne tout le reste tient en une phrase :
**on regarde d'abord, on s'inscrit quand on agit.**

---

## Le fil, d'un bout à l'autre

```
installation
   └─ mini-tour (UNE fois)            app/bienvenue.tsx
        └─ accueil consultable        app/(tabs)/index.tsx → AccueilPassager
             ├─ choix de lieu         (sans compte)
             ├─ « Fixez votre prix »  app/prix.tsx (sans compte)
             │    └─ « Envoyer ma proposition »  ← LA CONNEXION S'EXIGE ICI
             │         └─ connexion → prénom (une fois) → RETOUR au récap
             ├─ localisation          pré-écran au premier usage carte
             └─ Profil                ← la connexion s'exige aussi ici
                  └─ « Devenir conducteur » → dossier → validation admin
                       └─ raccourci « Passer en ligne » + sections conducteur
                            └─ bascule des mondes → cycle GO
```

---

## Chaque transition, et ce qui la tient

### 1. Installation → mini-tour

Trois cartes, au **premier lancement seulement**. La marque vit dans le stockage
local (`flex.accroche.vue`), donc elle survit à une déconnexion : on ne
réexplique pas le produit à quelqu'un qui l'a déjà utilisé.

La marque est **réactive** (`useAccrocheVue`). Ce n'est pas un raffinement : la
porte de `app/_layout.tsx` décide d'après elle, et une valeur lue une seule fois
au montage ferait renvoyer au tour juste après « Continuer » — le tour
deviendrait inescapable sans se connecter. Le défaut a existé le temps d'un
essai au simulateur.

« Passer » mène à la **carte 3**, jamais à la sortie : la ligne légale y vit, et
c'est le consentement qui rend l'inscription valable.

### 2. Mini-tour → accueil

« Continuer » va à l'**accueil**, pas à la connexion. On vient d'expliquer qu'on
propose son prix ; le geste suivant est d'en proposer un.

### 3. L'accueil se consulte sans compte

**La porte ne réclame rien.** `app/_layout.tsx` ne redirige que vers le
mini-tour, et seulement s'il n'a jamais été vu. Aucune garde globale.

Ce sont les écrans qui se protègent eux-mêmes, par `useGardeSession` — laquelle
emporte toujours le chemin de retour. Une porte globale rendrait ces gardes
inatteignables et demanderait un numéro de téléphone à quelqu'un qui vient
d'ouvrir l'application.

Ce qui se consulte sans compte : l'accueil, le choix de lieu, l'écran de prix,
les pages légales, À propos.

Ce qui exige une session : course, offres, mon profil, mes lieux, historique,
avis, bloqués, devenir conducteur, administration, **et l'onglet Profil** —
ouvrir son compte est déjà un geste.

**La grille de prix est publique en base**, pas seulement à l'écran :
`bornes_prix` et `prix_suggere()` sont ouvertes à `anon`
(`20260821120000_tarifs_publics`). Sans ça, l'écran censé être consultable
affichait « Impossible de charger la fourchette de prix » et son bouton restait
éteint. Ce qui reste fermé : tout le reste, `create_ride_request()` comprise.
`supabase/tests/120_tarifs_publics.sql` tient les deux moitiés.

### 4. L'action exige la connexion, et la connexion revient

C'est le point de friction le plus coûteux du produit. Le trajet et le prix
partent dans l'URL de retour (`cheminRetour` dans `app/prix.tsx`), la connexion
les rapporte (`src/lib/retour.ts`), et le passager retrouve **son** récap rempli.
Le renvoyer à l'accueil l'obligerait à tout re-choisir, et c'est exactement le
moment où l'on abandonne.

L'écran de connexion offre **toujours** un retour. Il ne le faisait pas tant
qu'il était la porte d'entrée — il n'y avait nulle part où revenir. Depuis qu'il
y a un accueil, il y a toujours quelque part : une garde posée par `replace` ne
laisse pas d'historique, d'où le repli sur l'accueil plutôt qu'un bouton inerte.

### 5. Le prénom, une seule fois

`apresConnexion()` détourne vers `connexion/prenom` tant que le prénom vaut
encore `'Passager'` — le repli posé par le déclencheur d'inscription. Laisser
passer, c'est un conducteur qui voit « Passager » à la place d'un nom, pour
toujours : personne ne va chercher ce réglage. Le chemin de retour traverse
cette étape sans se perdre.

### 6. La localisation, au premier usage carte

Pré-écran avant la demande système : on dit à quoi ça sert avant de demander.
Un refus n'est jamais une impasse — l'accueil reste utilisable, seuls le
centrage et le passage en ligne s'éteignent, et le motif s'affiche.

### 7. Devenir conducteur → validation → apparition

Le dossier se dépose depuis Profil. Un administrateur le valide depuis l'app
(`app/admin/`), pas depuis un back-office.

**La capacité se relit au retour au premier plan** (`useEstConducteur`), pas
seulement au montage. Un dossier se valide pendant que le candidat attend,
application ouverte : sans cette relecture, le raccourci et les sections
n'apparaîtraient qu'au prochain démarrage — et personne ne redémarre une
application pour vérifier si son dossier est passé. Il conclurait qu'on l'a
refusé sans le lui dire. `useEstAdmin` suit la même règle, et se relit en plus
au changement de session : sinon le drapeau d'un compte survivrait au suivant.

### 8. La bascule des deux mondes

Un geste, jamais un démarrage : on n'ouvre jamais l'application directement en
ligne. Un aller-retour au premier plan **garde** le monde ; un démarrage à froid
revient au monde passager. D'où l'horodatage de `flex.monde` et sa péremption de
cinq minutes — sans lui, on ne distingue pas les deux cas, le stockage survit
aux deux.

**Le monde meurt avec la session.** `useMonde` écoute `SIGNED_OUT` et efface la
marque, en mémoire comme au stockage. Sans ça, deux défauts : le compte suivant
sur ce téléphone démarrerait dans le monde conducteur d'un autre, et celui qui
se reconnecte se retrouverait au volant sans l'avoir demandé.

### 9. La déconnexion

**Hors ligne d'abord, session ensuite** (`src/lib/deconnexion.ts`). L'ordre n'est
pas négociable : `en_ligne` vit en base, et une déconnexion qui ne ferait que
`signOut()` laisserait la ligne à vrai pour toujours — le conducteur
disparaîtrait de son téléphone mais resterait dans la file des passagers, qui
lui enverraient des offres auxquelles personne ne répondrait. Une fois la
session fermée, plus rien ne peut corriger la ligne : `maj_position()` exige
d'être authentifié.

Si la mise hors ligne échoue, **on ne déconnecte pas**. Rester connecté est le
moindre mal ; on le dit et on propose de réessayer.

On repart de l'accueil, pas de la connexion.

---

## Ce qui a été mesuré, et comment

| Transition | Preuve |
|---|---|
| Tour, quatre tailles | `GABARIT ✓ bienvenue` et `bienvenue+fin` en 375×667, 390×844, 393×852, 440×956 |
| Accueil consultable sans compte | Capture après `session-dev?sortir=1` : carte, tuiles, onglets, aucun mur |
| Onglet Profil sans compte | Capture : rebond vers « Votre numéro » |
| Récap de prix sans compte | Capture : « 2 500 FCFA », fourchette 500–15 000, bouton d'envoi ACTIF |
| Grille ouverte à `anon`, et rien d'autre | `supabase/tests/120_tarifs_publics.sql`, 7 assertions |
| Relecture au premier plan | Journal Metro : `CAPACITE ↻` après arrière-plan → premier plan |
| Déconnexion en ligne | `en_ligne` passe de `true` à `false` en base, par le chemin du bouton |
| Retour passager après reconnexion | Capture : accueil passager + « Passer en ligne », pour un conducteur validé |

**Ce qui n'a pas été mesuré :** les appuis eux-mêmes. Le simulateur ne reçoit pas
de gestes synthétiques. Les états sont donc atteints par lien direct — ce qui
prouve les écrans et les gardes, pas le doigt qui les déclenche.

## L'entrée de développement

`exp://…/--/session-dev?jeton=…` ouvre une session locale sans mot de passe
(`scripts/session-locale.mjs`). `?sortir=1` la ferme par la **même** séquence que
le bouton du profil — c'est ce qui permet d'éprouver le parcours anonyme et la
déconnexion en ligne sans main humaine. `__DEV__` seulement.
