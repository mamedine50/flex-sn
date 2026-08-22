# Le parcours de référence

C'est la carte maîtresse. Tout écran ajouté à Flex doit s'y insérer sans casser
une seule des transitions décrites ici. Quand un choix d'interface hésite, c'est
ce document qui tranche.

La règle qui gouverne tout le reste tient en une phrase :
**on explique d'abord, on demande le compte ensuite, et rien avant.**

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

### 2. Mini-tour → connexion

« Continuer » mène au **numéro de téléphone**. On vient d'expliquer le produit ;
on demande maintenant de quoi s'en servir.

### 3. La porte réclame un compte

C'est ce que fait **toute** application de transport — Uber, Bolt, Yango, et
inDrive dont ce parcours reprend la méthode. On ne télécharge pas ce genre
d'application pour flâner : on la télécharge parce qu'on a besoin d'une course
maintenant. « Laisser regarder d'abord » vaut pour un catalogue, pas pour un
service qu'on utilise dans les deux minutes.

Ce qui reste visible sans compte : le mini-tour, la connexion, et **les deux
textes légaux** — sans eux, la ligne de consentement du tour promettrait des
documents qu'on ne pourrait pas lire.

Les gardes par écran (`useGardeSession`) restent en place derrière la porte.
Elles ne servent plus à grand-chose, et c'est très bien : une protection qui ne
s'appuie pas sur une seule ligne survit à un changement de cette ligne.

**Ce parcours a été ouvert puis refermé.** Il a existé une version où l'accueil,
le choix de lieu et l'écran de prix se consultaient sans compte. Elle marchait —
la grille de prix est d'ailleurs restée lisible par `anon` en base, ce qui ne
coûte rien et reste vrai. Mais vu sur un téléphone, arriver à choisir un trajet
sans jamais avoir dit qui on est se lit comme un oubli, pas comme une
attention.

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

### 8. Les DEUX entrées vers le monde conducteur

Il n'y a qu'une route — `/`, l'onglet Course — mais **deux entrées** côté
interface, et elles doivent aboutir au même endroit : la maison du conducteur,
hors ligne, carte plein écran et bouton GO. Jamais « Où allez-vous ».

| Entrée | Où | Appelle |
|---|---|---|
| « Passer en ligne » | Accueil passager, pour qui a la capacité | `entrerMondeConducteur()` |
| « Passer en mode conducteur » | Profil → Conducteur | `entrerMondeConducteur()` |

Le retour est unique lui aussi : « Mode passager », depuis la maison du
conducteur, appelle `revenirMondePassager()` — quelle qu'ait été l'entrée.

**ELLES ONT DIVERGÉ UNE FOIS, ET C'EST INSTRUCTIF.** Les deux lignes de code
étaient identiques — `basculer('conducteur')` — et pourtant une seule
fonctionnait. Le monde vivait dans un `useState` par appelant : le Profil
changeait SA copie, l'onglet d'accueil, déjà monté — une barre d'onglets ne
démonte pas ses écrans — gardait la sienne. Rien dans le code ne le disait.

Le monde est donc devenu un magasin de module (`src/lib/monde.ts`), lu par
`useSyncExternalStore` : il n'y a plus de copie à désynchroniser. Et les deux
entrées passent par la MÊME fonction (`src/lib/mondeEntree.ts`), pour qu'aucune
ne puisse re-diverger. `src/lib/__tests__/monde.test.ts` éprouve exactement le
défaut : un second abonné, qui n'a pas touché la bascule, est prévenu.

### 9. La bascule elle-même

Un geste, jamais un démarrage : on n'ouvre jamais l'application directement en
ligne. Un aller-retour au premier plan **garde** le monde ; un démarrage à froid
revient au monde passager. D'où l'horodatage de `flex.monde` et sa péremption de
cinq minutes — sans lui, on ne distingue pas les deux cas, le stockage survit
aux deux.

**Le monde meurt avec la session.** `useMonde` écoute `SIGNED_OUT` et efface la
marque, en mémoire comme au stockage. Sans ça, deux défauts : le compte suivant
sur ce téléphone démarrerait dans le monde conducteur d'un autre, et celui qui
se reconnecte se retrouverait au volant sans l'avoir demandé.

### 10. La déconnexion

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

### 11. Proposer un prix → la négociation, dans les deux sens

Une négociation est un **fil** entre une demande et un conducteur. Chaque message
est une offre, signée de son auteur et numérotée :

```
tour 1  le conducteur répond        (accepte le prix, ou en propose un autre)
tour 2  le passager contre-propose  ← premier aller-retour
tour 3  le conducteur contre-propose
tour 4  le passager contre-propose  ← second aller-retour
puis    accepter ou refuser, rien d'autre
```

**Deux allers-retours, et c'est tout.** La limite n'est pas une prudence
technique : un marchandage sans fin fait perdre la course aux deux — le passager
attend, le conducteur ne roule pas, et la demande expire pendant qu'on discute.
Le cinquième message est refusé par le SERVEUR, et l'écran le dit avant.

**Une seule offre vivante par fil.** Contre-proposer rend la précédente caduque :
à tout instant, une seule des deux parties a la balle.

**Le conducteur doit VOIR la réponse.** Sa file ne montre que les demandes
ouvertes ; un fil où le passager vient de répondre n'y ressort pas. D'où
`negociations_conducteur`, et « on vous a répondu » **en tête** de sa file — ce
qui lui est adressé passe devant ce qui est ouvert à tous. La vue ne porte pas
le libellé exact du départ : la course n'est pas acceptée.

### 12. Accepter → le cycle de course

`verrouillee → en_route → arrive → commencee → terminee`, piloté par le
conducteur. Le passager regarde avancer.

**Deux gestes se GLISSENT, les autres se tapent.** Démarrer et terminer décident
de l'argent : une course démarrée trop tôt fait payer une attente, terminée trop
tôt elle coupe le suivi en pleine route. Ces deux-là ne doivent pas pouvoir se
faire dans une poche. Partir, signaler son arrivée, appeler, écrire, noter
restent des appuis — un glissement sur une action fréquente est une punition.

**Le règlement est en espèces, et c'est écrit.** « à régler » côté passager,
« à encaisser · 0 % comm. » côté conducteur. Un prix sans mode de règlement
laisse croire à un prélèvement.

**La position n'est suivie que pendant le déplacement**, et seulement par le
passager de la course. Un conducteur simplement disponible n'est suivi par
personne — prouvé hors course, pas seulement pendant.

### 13. Terminer → la notation, qui est un péage

La note est **obligatoire** et la course reste « la sienne » tant qu'elle n'est
pas donnée : c'est ce qui tient l'écran de notation à l'écran. Sans cette règle,
l'écran disparaissait à la seconde où le conducteur appuyait sur « Terminer ».

Double aveugle : aucune des deux personnes ne voit la note de l'autre avant
d'avoir donné la sienne, ou avant sept jours. Les **puces** — « Ponctuel »,
« Conduite sûre » — sont facultatives et validées contre la cible : on ne dit
pas d'un passager que sa voiture est propre.

Une fois notée, le conducteur **retourne en ligne** sans re-tapper GO.

### 14. Devenir conducteur : une étape à la fois

Huit étapes, une seule question à l'écran. **On n'avance pas sur une pièce
refusée** : un refus au milieu d'une longue liste passe inaperçu pendant des
jours. Le bouton dit POURQUOI il n'avance pas, au lieu de rester gris.

Cinq pièces, dont le **selfie tenant le permis** — une photo de permis seule
prouve qu'on possède l'image d'un permis, pas qu'on en est le titulaire.
L'administrateur compare trois images côte à côte : le selfie, le permis, la
photo de profil. **Aucune reconnaissance faciale** : la comparaison est humaine,
et la politique de confidentialité le dit.

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
| Les deux entrées mènent au même monde | `src/lib/__tests__/monde.test.ts` — un abonné qui n'a pas basculé est prévenu |
| Suppression de compte | `supabase/tests/260_supprimer_mon_compte.sql`, 17 assertions |
| Signalement | `supabase/tests/270_signalements.sql`, 10 assertions |
| Négociation, quatre tours et le cinquième refusé | `supabase/tests/280_negociation.sql` (16) et `scripts/parcours-negociation.mjs`, à la clé anonyme |
| Puces de notation | `supabase/tests/290_puces_notation.sql`, 9 assertions |
| Routes, clés, RPC, tables : tout ce que le code appelle existe | `pnpm diagnostic` |
| Retour passager après reconnexion | Capture : accueil passager + « Passer en ligne », pour un conducteur validé |

**Ce qui n'a pas été mesuré :** les appuis eux-mêmes. Le simulateur ne reçoit pas
de gestes synthétiques. Les états sont donc atteints par lien direct — ce qui
prouve les écrans et les gardes, pas le doigt qui les déclenche.

## L'entrée de développement

`exp://…/--/session-dev?jeton=…` ouvre une session locale sans mot de passe
(`scripts/session-locale.mjs`). `?sortir=1` la ferme par la **même** séquence que
le bouton du profil — c'est ce qui permet d'éprouver le parcours anonyme et la
déconnexion en ligne sans main humaine. `__DEV__` seulement.
