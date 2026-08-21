# Parcours conducteur — de GO à la note

Le monde du conducteur, écran par écran, et la façon de l'éprouver.

## Ce qui a changé, et pourquoi

Le conducteur n'avait pas de maison : il ouvrait l'application sur « Où
allez-vous », la question du passager. Deux mondes vivent maintenant côte à côte,
avec une bascule et **pas de tiroir**.

| | Monde passager | Monde conducteur |
|---|---|---|
| Onglet « Course » | « Où allez-vous », carte, deux tuiles | carte, gains du jour, GO |
| Entrée | par défaut | pastille « Passer en ligne », ou le Profil |
| Sortie | — | « Mode passager » |
| Onglet « Profil » | identique | identique |

La règle de survie n'est pas la même dans les deux sens : **un aller-retour au
premier plan garde le monde** — répondre à un appel ne doit pas coûter sa place —
mais **un démarrage à froid revient au passager**. On n'ouvre jamais
l'application déjà en ligne sans un geste. D'où une marque horodatée, avec
péremption : sans instant, on ne distingue pas « mise de côté » de « fermée », le
stockage survivant aux deux.

## Les états de la maison

| État | Ce qu'on voit | GO |
|---|---|---|
| Hors ligne | carte, gains du jour, « Appuyez sur GO » | vif |
| Position jamais demandée | idem | **vif** — GO sert alors à demander la permission |
| Position refusée | bandeau « Activez la localisation » | éteint |
| Hors couverture (>50 km de Dakar) | bandeau | éteint |
| En ligne, sans demande | « À l'écoute des demandes autour de vous » | état EN LIGNE |
| En ligne, demandes | la file remonte en feuille sur la carte | état EN LIGNE |

Un bouton éteint dit toujours pourquoi. Et l'absence de permission **n'éteint
pas** GO : punir quelqu'un de ne pas avoir deviné une question qu'on ne lui a pas
posée serait absurde.

## Les deux verrous

**Une course à la fois.** Pendant une course active, la file reste **lisible** —
savoir ce qui passe autour a de la valeur — mais s'engager s'éteint : ni
accepter, ni contre-proposer, parce qu'une contre-offre acceptée créerait une
seconde course. Le serveur la refuse déjà par `conducteur_indisponible` ; l'écran
le dit avant, plutôt que de laisser partir un appui pour rien.

**La note est un péage, pas un mur.** Une course terminée reste « la sienne »
tant qu'il ne l'a pas notée. C'est ce qui tient l'écran de notation à l'écran, et
c'est aussi ce qui retient l'acceptation suivante — deux secondes, puis tout se
rouvre. Après la note, retour automatique à l'état en ligne, la feuille déjà
remontée.

## Éprouver le parcours

```bash
pnpm db:start
node scripts/parcours-conducteur.mjs
```

Deux sessions réelles, la clé anonyme, PostgREST comme l'application. Le script
crée ses acteurs par l'API admin de la pile locale et les efface : aucun mot de
passe n'existe, donc aucun ne peut fuiter. Il **refuse de tourner ailleurs qu'en
local** — une clé de service pointée sur le distant annulerait toute la RLS.

### Sortie d'un passage

```
── Deux acteurs, créés pour ce passage
✓ session passager                                         conducteur-bineta-1787326884337@flex.test
✓ session conducteur (documents validés, véhicule actif)   conducteur-cheikh-1787326884602@flex.test

── 1. Le conducteur passe en ligne
✓ il se déclare en ligne, avec sa position                 
✓ sa file est vide : personne ne demande rien              

── 2. Une demande arrive
✓ elle apparaît dans la file du conducteur                 
✓ avec la MAILLE et la commune, jamais le point exact      14.7075 / -17.4475 · Biscuiterie
✓ et la destination est nommée — c’est ce que le conducteur décide Mermoz–Sacré-Cœur

── 3. Il propose son prix
✓ contre-offre soumise                                     2000 FCFA · 6 min

── 4. Le passager accepte, la course démarre
✓ course verrouillée                                       79873f83-5d01-436b-b3aa-41b45b31c330

── 5. Pas d’enchaînement : une course à la fois
✓ la demande suivante reste VISIBLE pendant la course      la file n’est pas coupée, seule l’acceptation l’est
✓ mais s’engager est REFUSÉ par le serveur, pas seulement grisé conducteur_indisponible

── 6. Il conduit
✓ il passe à « en_route »                                  
✓ il passe à « arrive »                                    
✓ il passe à « commencee »                                 
✓ il passe à « terminee »                                  

── 7. La course reste la sienne tant qu’il n’a pas noté
✓ terminée, elle reste servie — sinon l’écran de notation n’existe pas terminee
✓ et il ne l’a pas encore notée                            

── 8. Il note, et rien ne le retient plus
✓ il note son passager                                     
✓ la note est enregistrée — le péage est levé              
✓ il retrouve une file où il peut de nouveau s’engager     1 demande(s)
✓ et sa journée s’est incrémentée                          2000 FCFA · 1 course(s)

PARCOURS CONDUCTEUR COMPLET — aucune assertion en échec.
Comptes éphémères effacés.
```

## Le jouer sur le DISTANT : les numéros de test

Sur le distant, l'API admin n'est pas disponible au script — il n'a que la clé
anonyme, et c'est voulu. Deux sessions y demandent donc deux numéros qui
reçoivent un code. Twilio ne dessert pas encore le +221, et un vrai téléphone par
acteur n'est pas tenable.

La réponse est un **numéro de test Supabase** : un numéro fictif associé à un code
fixe, qui n'envoie aucun SMS et ne coûte rien.

**À poser dans la console** — Authentication → Sign In / Providers → Phone →
*Test phone numbers* :

| Numéro | Code |
|---|---|
| `+15550000001` | `123456` |
| `+15550000002` | `123456` |

Ce réglage vit dans la configuration de GoTrue, **pas dans la base** : il ne se
pose ni en SQL, ni par migration, ni par le connecteur — aucun de ces chemins ne
touche à la configuration d'authentification.

Deux chemins existent, et un seul est sûr :

- **La console.** Trente secondes, aucun effet de bord. C'est celui-ci.
- **L'API de gestion** (`PATCH /v1/projects/{ref}/config/auth`, champ
  `sms_test_otp`). Elle marche, mais elle demande un jeton d'accès personnel —
  une clé de compte, pas une clé de projet, qui ouvre TOUS les projets de son
  porteur. Elle ne se met pas dans le dépôt et ne se confie pas à un outil.

**Ce qu'il ne faut PAS faire :** `supabase config push`. La commande pousse
`supabase/config.toml` en entier. Le fichier du dépôt est le gabarit local — pas
de Twilio, `site_url` en `127.0.0.1` — et l'envoyer **écraserait la
configuration SMS du distant**, c'est-à-dire la seule chose qui marche
aujourd'hui côté envoi.

Une fois posés, ces deux numéros servent aussi :

- de **second compte** pour tester le monde conducteur à deux sur un seul
  téléphone ;
- de **compte de démonstration pour la revue Apple**, qui exige un accès complet
  à l'application sans matériel particulier.

Le script les prendra par `PARCOURS_TEL_PASSAGER` / `PARCOURS_TEL_CONDUCTEUR`
dans l'environnement, jamais en dur dans le dépôt.

## Ce que le parcours ne couvre pas

- L'appui réel sur GO, la feuille qui remonte, le geste de notation : le
  simulateur ne reçoit pas de gestes synthétiques. Ces états sont vérifiés par
  capture et par l'assertion de gabarit, pas par la main.
- La concurrence sur `accept_offer()` : elle a sa propre preuve, avec deux
  connexions réelles, dans `supabase/tests/060_accept_offer_concurrence.sql`.
