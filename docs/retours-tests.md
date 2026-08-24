# Retours de test — registre

Les retours arrivent au fil de l'eau, souvent en plein milieu d'un autre
chantier. Sans registre, un point signalé pendant qu'on travaille sur autre
chose se perd — et il ne sera pas redit, il sera supposé pris en compte.

Ce fichier vit avec le code qui corrige ces points. Un retour n'en sort que
quand le correctif est **commité**, pas quand il est écrit.

> **Attention au décalage build.** « Corrigé » veut dire corrigé dans le dépôt.
> Tant qu'un build ne l'emporte pas, le testeur voit encore le défaut — et le
> resignalera. La colonne **Build** dit à partir duquel c'est visible.

---

## Traité

| # | Retour | Cause réelle | Build |
|---|---|---|---|
| 1 | Les chauffeurs ne voient pas les propositions | Trois causes cumulées : rayon d'écoute à 3 km alors que la demande était à 3,6 km ; la carte partait sur Dakar faute de permission de localisation, donc des courses créées au Sénégal depuis Gatineau ; demandes mortes en 5 min | 14 |
| 2 | (cause de 1) Position du conducteur figée | Publiée UNE seule fois, à l'appui sur GO. Un premier point erroné ne se corrigeait jamais — un conducteur figé à 900 km | 14 |
| 3 | Une adresse tapée hors de Dakar ne donne rien | La table ne contient que des lieux dakarois. Ajout de « Utiliser « … » comme adresse » : la position vient du repère, le nom de ce qu'on écrit | 14 |
| 4 | Page d'administration incohérente | L'écran de détail lisait dans la file d'attente, qui se vide dès la dernière pièce tranchée | 14 |
| 5 | Le logo ne change pas après mise à jour | Une mise à jour par-dessus l'air ne remplace pas l'icône : elle est native, compilée dans le binaire | 12 |
| 6 | Un conducteur validé pouvait encore redéposer ses pièces | `soumettre_document()` acceptait tout statut. La pièce repassait en attente mais la capacité restait ouverte : il roulait avec un fichier que personne n'avait regardé | — |
| 7 | « Il attend depuis 2 j » persistait après validation | La file d'admin ne se relisait qu'au montage ; le retour arrière ne remonte pas l'écran | — |
| 8 | « Bloquer » n'a rien à faire sur l'écran de course | Deux rouges empilés, et bloquer n'agit que sur les appariements futurs. Déplacé dans l'historique, à côté de « Signaler » | — |
| 9 | Le dernier glissement « Terminer » ne marche pas | La même instance servait « Démarrer » puis « Terminer » ; la pastille restait collée à droite, plus nulle part où aller | — |
| 10 | Les autres conducteurs ne savent pas que la course est prise | Leur offre devenait caduque en silence — ce qui se lit comme un échec personnel | — |
| 11 | Une demande acceptée doit refuser les contre-propositions | Déjà tenu (`demande_verrouillee`). En le vérifiant : le verrou « une course à la fois » testait une liste de statuts périmée, et tenait par une violation d'unicité au lieu d'une erreur métier | — |
| 12 | Les numéros de téléphone circulent par SMS | Messagerie interne : le fil naît à la course verrouillée, se ferme à la fin — lisible après pour un signalement, plus jamais réécrivable | — |
| 13 | L'écran des offres reste figé quand la course est acceptée | Il ne partait que si le PASSAGER acceptait. Le conducteur accepte aussi — et depuis la négociation à double sens, c'est le cas le plus fréquent en fin de fil. Le passager restait devant un minuteur pendant qu'une voiture roulait vers lui | — |
| 14 | Itinéraire pour se rendre au client | Passage de main à Plans / Google Maps. Directions est facturé à l'appel et interdit ; le trait sur la carte est POINTILLÉ pour ne pas se faire passer pour une route | — |
| 15 | Prévenir le conducteur qu'il est arrivé | Bandeau « Vous y êtes » à 80 m. Il met le bouton en avant, il ne l'appuie pas : laisser le GPS avancer la course, ce serait démarrer une attente payante sur un point qui a sauté d'un immeuble | — |
| 18 | « Vous avez déjà répondu » bloqué chez le conducteur | La demande restait dans la file alors que `submit_offer()` allait la refuser. La carte proposait un geste que le serveur interdisait — un bouton qui existe est une promesse. Elle sort de la file ; le fil se poursuit dans `negociations_conducteur`, en tête d'écran | — |
| 21 | « En route » affiché sur une course TERMINÉE | Le titre était figé. Le seul mot qui résume où l'on en est disait le contraire du reste de l'écran — et un en-tête, on le lit en premier et on lui fait confiance | — |
| 22 | « Course en cours » pour une course seulement à noter | `useCourse()` sert les courses terminées tant qu'on ne les a pas notées — c'est le péage de la note, et il est voulu. Mais on croyait sa voiture en route, on appuyait, on tombait sur un écran de notation | — |
| 20 | Notifications push | `expo-notifications` + une fonction de bord qui appelle Expo. Le déclencheur est ASYNCHRONE : un service tiers lent ne doit pas ralentir la transaction qui a créé la notification. **Dépendance native → reconstruction obligatoire** | — |
| 19 | Écran des notifications | Boîte, cloche et compte. Sans temps réel : 200 connexions au plan gratuit, et une pastille n'a pas besoin d'être juste à la seconde | — |
| 17 | « Ce conducteur a pris une autre course » sous une simple contre-offre | Deux défauts. `contre_proposer()` marque l'offre précédente `caduque` avant d'insérer la nouvelle, et la liste affichait TOUS les tours : quatre cartes pour un conducteur, et « 2 offres » annoncé au-dessus de trois. Et la phrase était fausse dans tous les cas — une offre devient caduque parce que LE PASSAGER a choisi quelqu'un d'autre | — |
| 23 | « Vous n'avez pas de course en cours » sans dire pourquoi | Un SEUL chemin y mène : l'appui sur une notification dont la course n'existe plus. L'écran disait qu'il n'y avait rien, sans nommer la cause — et son bouton portait « Proposer un prix » en menant à l'accueil | — |
| 24 | Quatre états d'ERREUR sans aucune sortie | « Impossible de charger » et rien d'autre. Sur un réseau sénégalais l'échec est l'ordinaire : « Réessayer » est l'action la plus fréquente du produit, et elle manquait partout | — |
| 25 | L'écran des réglages s'appelait « Affichage » | Il contient aussi les personnes bloquées, l'aide et « à propos ». La ligne du profil dit « Réglages » : le même écran portait deux noms, et celui qu'on lisait en arrivant était le plus étroit des deux | — |
| 26 | Le compte de revue s'affichait « Conducteur Conducteur Test » | `nom_complet` porte le NOM DE FAMILLE — l'écran demande « Nom » et affiche prénom + nom. Ma donnée d'amorce y avait mis le nom entier. Corrigé sur le distant ET dans le bloc de `docs/publication.md`, sans quoi le prochain qui le rejoue le reproduirait | — |
| 16 | Prévenir le passager que le conducteur est là | Notification `conducteur_arrive` — la seule étape du trajet qui en vaut une, parce que le passager attend DEHORS, téléphone en poche | — |

## Pas encore traité

| # | Retour | État |
|---|---|---|
| E | Poids des photos (295 Ko par pièce) | **Proposé, non fait** — diviserait par deux la place et par trois le trafic |
| G | « Aucun lieu enregistré » s'affiche au-dessus de trois lignes visibles | **Constaté, non corrigé** — techniquement juste (Domicile et Travail sont des emplacements à définir, pas des lieux enregistrés) mais ça se lit comme une contradiction |
| H | « Cinq pièces à fournir » puis « ÉTAPE 1 SUR 8 » | **Constaté, non corrigé** — les deux sont vrais : photo de profil, cinq pièces, véhicule, récapitulatif. Mais on annonce cinq et on en montre huit |
| F | Bach et Oumar ne peuvent pas conduire | **Se règle tout seul** : ils suppriment leur compte et en refont un. L'assistant demande les CINQ pièces, photo du véhicule comprise |

## Décidé, pas à faire

| Sujet | Décision |
|---|---|
| Appel masqué (relais) | **Plus tard.** Twilio coûterait 180 à 420 FCFA par appel — jusqu'à 17 % d'une course — et un numéro étranger ferait payer l'international à l'utilisateur. La piste est Sonatel, en contrat B2B, et le SMS de connexion passe avant |
| Directions / tracé d'itinéraire | **Jamais.** Facturé à l'appel, interdit par la règle du dépôt |
