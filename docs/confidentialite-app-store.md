# App Privacy — les réponses, et d'où elles viennent

Le questionnaire de confidentialité d'App Store Connect ne passe pas par
`eas metadata:push` : il se remplit à la main, une fois, et il faut y revenir à
chaque fois que l'application collecte quelque chose de nouveau.

Ce fichier existe pour deux raisons : ne pas redécouvrir les réponses la
prochaine fois, et pouvoir justifier chacune d'elles en pointant la table qui
la produit.

**Où :** App Store Connect → l'app → **App Privacy** → *Edit*.

---

## La réponse d'ouverture

> **Do you or your third-party partners collect data from this app?** → **Yes**

---

## Ce qui est collecté

Pour chaque ligne, App Store Connect pose trois questions : à quoi ça sert, est-ce
rattaché à l'identité, est-ce utilisé pour du suivi publicitaire.

**Partout : « App Functionality » · « Linked to the user » : Oui · « Used for tracking » : NON.**

| Catégorie Apple | Ce que c'est chez nous | D'où ça vient |
|---|---|---|
| Contact Info → **Phone Number** | L'identifiant de connexion | `profiles.telephone` |
| Contact Info → **Name** | Prénom, et nom complet s'il est renseigné | `profiles.prenom`, `nom_complet` |
| Location → **Precise Location** | Le point de départ, et la position du conducteur pendant la course | `ride_requests.depart_*`, `positions_conducteurs` |
| User Content → **Photos or Videos** | Photo de profil, et les cinq pièces du dossier conducteur | `photos-profil`, `documents-conducteur` |
| User Content → **Other User Content** | Messages du fil, commentaires d'évaluation, motifs de signalement | `messages`, `evaluations`, `signalements` |
| Identifiers → **User ID** | L'identifiant du compte | `profiles.id` |
| Identifiers → **Device ID** | Le jeton de notification, propre à chaque appareil | `jetons_push` |
| Purchases → **Purchase History** | L'historique des courses et des montants convenus | `rides.prix_convenu_xof` |

### Sur « Purchase History », qui est un jugement

Flex ne traite aucun paiement : le prix se règle en espèces, de la main à la
main. On pourrait donc répondre non.

On répond **oui** quand même, parce que l'application CONSERVE la trace de ce qui
a été convenu et payé, course par course. Apple définit la catégorie comme « les
achats d'un compte ou ses habitudes d'achat » — c'est exactement ce que contient
`Mes courses`. Sur-déclarer ne coûte rien ; sous-déclarer est un motif de rejet
et, découvert après coup, une question de confiance.

---

## Ce qui n'est PAS collecté

À cocher explicitement comme non collecté, chaque réponse a sa raison :

| Catégorie | Pourquoi non |
|---|---|
| **Financial Info** (moyens de paiement) | Aucun paiement ne transite. Pas de carte, pas de compte marchand |
| **Health & Fitness** | Sans objet |
| **Contacts** | L'application ne lit jamais le répertoire |
| **Search History**, **Browsing History** | La recherche de lieu est locale et n'est pas conservée |
| **Sensitive Info** | Ni origine, ni opinion, ni **gabarit biométrique**. La comparaison entre le selfie et la pièce d'identité est faite **par une personne**, jamais par un algorithme — c'est écrit dans la politique de confidentialité, section 8 |
| **Usage Data**, **Diagnostics** | Aucun SDK d'analytique, aucun rapport de plantage, aucune régie. Vérifiable : `package.json` ne contient ni Sentry, ni Firebase, ni Amplitude, ni équivalent |

---

## Le suivi publicitaire : non, et ça a une conséquence

> **Is this app used to track people?** → **No**

Aucune donnée n'est partagée avec un courtier, aucune n'est croisée avec
l'activité dans d'autres applications. **Conséquence pratique : Flex n'a pas
besoin de la demande App Tracking Transparency**, et ne doit pas l'afficher —
une demande ATT sans suivi derrière est elle-même un motif de rejet.

---

## Ce qui déclenche une mise à jour de ce questionnaire

Toute nouvelle table qui stocke quelque chose d'une personne. En pratique :

- une **méthode de paiement** → ouvre `Financial Info`, et la réponse « Purchase
  History » cesse d'être un jugement pour devenir une évidence ;
- un **SDK d'analytique ou de plantage** → ouvre `Usage Data` et `Diagnostics`,
  et pose la question du suivi ;
- une **régie publicitaire** → change la réponse ATT, avec tout ce qui suit.

Aucune de ces trois n'est au périmètre V1.
