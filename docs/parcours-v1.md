# Parcours V1 — de l'accueil à la note

Ce document décrit le chemin complet d'une course dans Flex, écran par écran, et
la manière dont il est vérifié. Il ne décrit pas l'intention : il décrit ce qui
tourne.

## Les écrans, dans l'ordre

| # | Écran | Fichier | On y arrive par | On en sort vers |
|---|-------|---------|-----------------|-----------------|
| 1 | Accueil | `app/(tabs)/index.tsx` | onglet « Course » | `prix` (une tuile), `offres` ou `course` (bande de reprise) |
| 2 | Fixez votre prix | `app/prix.tsx` | tuile urbain / interurbain | `offres`, par `replace` |
| 3 | Offres reçues | `app/offres.tsx` | envoi de la proposition | `course` quand une offre est acceptée |
| 4 | Mode conducteur | `app/conducteur.tsx` | Profil → Mode conducteur | `course` dès qu'une offre est acceptée |
| 5 | En route | `app/course.tsx` | acceptation, des deux côtés | accueil quand la course est terminée ou annulée |
| — | Profil | `app/(tabs)/profil.tsx` | onglet « Profil » | `devenir-conducteur` ou `conducteur` |
| — | Conduire avec Flex | `app/devenir-conducteur.tsx` | Profil, sans la capacité | retour au Profil |

Trois décisions de navigation, et leur raison :

- **`prix` → `offres` par `replace`, pas `push`.** La proposition est partie ;
  revenir au formulaire ne mènerait qu'à `demande_deja_ouverte`. La confirmation
  provisoire qu'affichait l'écran 2 a disparu — l'écran des offres la porte
  déjà, et la dire deux fois laissait l'utilisateur sur un écran qui n'avait
  plus rien à faire.
- **Accepter une offre mène à `course`, sans retour.** Rester sur la liste
  laisserait le passager devant des offres devenues caduques pendant que sa
  voiture roule vers lui.
- **L'accueil ne redirige pas d'autorité.** Quelqu'un qui ouvre l'application
  pendant sa course peut vouloir regarder la carte. Une bande de reprise —
  « Course en cours » ou « Proposition en cours » — propose, elle n'impose pas.

Les écrans de la négociation restent **hors des onglets** : une fois qu'on a
proposé un prix, une barre d'onglets inviterait à partir ailleurs au moment
précis où il faut rester.

## Le parcours vérifié de bout en bout

`scripts/parcours-v1.mjs` joue le trajet complet **sur le projet distant**, avec
**deux vraies sessions** et la clé anonyme — jamais `service_role`.

```bash
node scripts/parcours-v1.mjs
```

Pourquoi pas seulement pgTAP : les 259 assertions pgTAP tournent en `postgres`,
qui traverse les policies et les `grant`. Un droit manquant ne s'y voit pas. Ce
script passe par PostgREST comme l'application, et c'est le seul endroit où un
`grant` oublié tombe.

### Ce qu'il prouve

1. **La recommandation est un plancher, pas un prix.** Le passager propose *en
   dessous* de la recommandation, et la demande est acceptée. Un système qui
   n'accepte que le prix suggéré n'est pas une négociation.
2. **Le conducteur reçoit la MAILLE.** `demandes_proches()` sert
   `zone_depart_lat/lon`, arrondis, plus un nom de commune — jamais le point
   exact. L'assertion compare les deux et exige qu'ils diffèrent.
3. **Avant acceptation, rien ne fuit.** Le passager ne lit ni le nom complet, ni
   le numéro, ni la plaque, ni la position du conducteur. Quatre assertions, une
   par chemin.
4. **L'acceptation est la bascule.** Les mêmes quatre lectures, refaites juste
   après `accept_offer()`, rendent cette fois le nom, le numéro et la plaque.
5. **Le suivi s'arrête avec la course.** La position est servie pendant
   `en_route` / `arrive` / `commencee`, et plus du tout après `terminee`.
6. **Les deux notent**, et le compteur de courses terminées avance — c'est lui
   qui fait tomber le badge « Nouveau conducteur » au bout de cinq courses.

### Sortie d'un passage

```
── Deux sessions
✓ session passager                                         0de00de0-0000-4000-8000-00000000de00
✓ session conducteur                                       c0c0c0c0-0000-4000-8000-000000000009

── 1. Le passager fixe son prix
✓ une recommandation existe                                1100 FCFA
✓ demande créée sous la recommandation                     600 FCFA

── 2. Le conducteur reçoit la demande
✓ la demande est dans la file du conducteur                1 demande(s)
✓ le départ servi est la MAILLE, pas le point exact        14.7075 / -17.4475
✓ la commune de départ est nommée                          Biscuiterie
✓ ni nom complet ni téléphone dans la file

── 3. Le conducteur répond
✓ contre-offre soumise                                     1100 FCFA · 6 min
✓ le passager voit l'offre                                 1 offre(s)
✓ prénom, véhicule et badge : oui — plaque et téléphone : non  Ousmane · Kia Picanto grise
✓ le badge remplace la note tant qu'il y a moins de cinq courses  est_nouveau=true · 0 course(s)

── 4. Avant acceptation, la confidentialité tient
✓ le passager ne lit ni le nom complet ni le numéro du conducteur  aucune ligne servie
✓ ni la plaque                                             0 ligne(s)
✓ ni la position                                           0 ligne(s)

── 5. Le passager accepte
✓ course verrouillée                                       d69b672b-…
✓ au prix de l'offre acceptée                              1100 FCFA
✓ APRÈS acceptation : nom complet et numéro arrivent       Ousmane Sow · +221781112233
✓ et la plaque aussi                                       DK-4821-AB

── 6. En route
✓ le conducteur passe à « en_route »
✓ le conducteur passe à « arrive »
✓ le conducteur passe à « commencee »
✓ pendant la course, le passager suit la voiture           14.7101 / -17.4468
✓ le conducteur termine
✓ course terminée, le suivi s'arrête                       0 ligne(s)

── 7. Les deux notent
✓ le passager note
✓ le conducteur note
✓ le compteur de courses du conducteur avance              1 course(s) · nouveau=true

PARCOURS COMPLET — aucune assertion en échec.
```

### Les deux comptes

`dev@flex.test` (passager) et `essai-route@flex.test` (conducteur), tous deux sur
le projet distant. Ils **partent avant l'ouverture publique** : c'est un bloquant
listé dans le README, au même titre que le fournisseur SMS.

## Ce que le parcours a trouvé

Trois défauts, tous vus en faisant tourner le chemin, aucun en relisant le code :

- **Deux `useCourse()` montés en même temps plantaient l'application.** L'accueil
  propose de reprendre, l'écran En route affiche la course : les deux
  demandaient un canal Realtime du même nom, et le second `.on()` arrivait après
  le `.subscribe()` du premier. Chaque instance porte maintenant son numéro.
- **Un dossier conducteur complet n'ouvrait rien.** `est_conducteur()` exige les
  documents validés **et** un véhicule actif, et rien ne permettait d'en
  déclarer un. D'où `declarer_vehicule()` et le bloc véhicule de l'écran.
- **`useVehicule()` lisait le véhicule d'un autre.** La policy
  `vehicles_course_active` sert aussi la voiture de la course en cours : sans
  filtre sur `conducteur_id`, l'écran affichait la plaque du conducteur d'en
  face comme « votre véhicule ».

## Ce que le parcours ne couvre pas

- L'authentification réelle : la production est en OTP téléphone, et le
  fournisseur SMS n'est pas branché. Les deux sessions passent par mot de passe.
- Le paiement, le back-office, les notifications push, le pricing interurbain —
  hors périmètre V1, par décision.
- La concurrence sur `accept_offer()` : elle a sa propre preuve, avec deux
  connexions réelles, dans `supabase/tests/060_accept_offer_concurrence.sql`.
