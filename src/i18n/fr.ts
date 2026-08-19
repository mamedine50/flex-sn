/**
 * Français — langue de référence. Toute clé existe ici en premier ; les autres
 * langues se comparent à ce fichier.
 *
 * Voix active. Un bouton dit ce qui se passe.
 */
export const fr = {
  commun: {
    annuler: 'Annuler',
    continuer: 'Continuer',
    retour: 'Retour',
    fermer: 'Fermer',
    reessayer: 'Réessayer',
    chargement: 'Un instant…',
    appeler: 'Appeler',
    ecrire: 'Écrire',
  },

  langues: {
    titre: 'Langue',
    fr: 'Français',
    en: 'English',
    wo: 'Wolof',
  },

  theme: {
    titre: 'Apparence',
    systeme: 'Comme le téléphone',
    clair: 'Clair',
    sombre: 'Sombre',
  },

  accueil: {
    ou: 'Où allez-vous ?',
    urbain: 'Trajet urbain',
    urbainSous: 'Fixez votre prix',
    interurbain: "D'une ville à l'autre",
    interurbainSous: 'Trajets interurbains',

    // Pastille du point de départ. Un état par situation : l'écran ne ment
    // jamais sur ce qu'il sait de la position.
    pointDepart: 'Point de départ',
    choisirDepart: 'Choisir mon point de départ',
    localisationEnCours: 'Recherche de votre position…',
    maPosition: 'Ma position',
    localisationRefusee: 'Localisation désactivée',
    ouvrirReglages: 'Ouvrir les réglages',

    horsLigne: 'Hors ligne. Vous pouvez préparer votre trajet.',
    carteIndisponible: 'La carte ne se charge pas.',
    carteIndisponibleAide: "Vérifiez le réseau. Le reste de l'écran fonctionne.",
  },

  prix: {
    titre: 'Fixez votre prix',
    depart: 'Départ',
    destination: 'Destination',
    montant: 'Votre prix',
    baisser: 'Baisser de 100 F',
    monter: 'Monter de 100 F',
    fourchette: 'Les conducteurs acceptent souvent entre {min} et {max}',
    envoyer: 'Envoyer ma proposition',
    tropBas: 'Ce prix est en dessous de {min}. Peu de conducteurs répondront.',
    tropHaut: 'Ce prix dépasse {max}.',

    choisirDepart: 'Choisir le départ',
    choisirDestination: 'Choisir la destination',
    chercherVille: 'Chercher une ville',
    aucuneVille: 'Aucune ville ne correspond.',

    // Le repère est fixe, c'est la carte qui bouge dessous.
    reperePosition: 'Déplacez la carte pour placer le repère',
    precisionFacultative: 'Précisez : devant la pharmacie, entrée du terrain…',
    pointSurLaCarte: 'Point sur la carte',
    confirmerCePoint: 'Confirmer ce point',

    prixSuggere: 'Prix suggéré',
    saisirPrix: 'Entrez votre prix',
    prixManquant: 'Entrez le prix que vous proposez.',

    // Les bornes viennent de la base. Sans elles on n'affiche AUCUN prix :
    // une fourchette inventée ferait proposer un montant que le serveur refuse.
    bornesEnCours: 'Chargement de la fourchette…',
    bornesIndisponibles: 'Impossible de charger la fourchette de prix.',
    bornesIndisponiblesAide: 'Sans elle, un prix proposé serait refusé. Réessayez.',

    envoiEnCours: 'Envoi…',
    horsLigne: 'Hors ligne. Votre proposition partira au retour du réseau.',
    departManquant: 'Indiquez votre point de départ.',
    destinationManquante: 'Indiquez où vous allez.',
  },

  offres: {
    titre: 'Offres reçues',
    attente: 'Votre proposition est partie. Les réponses arrivent ici.',
    vide: 'Aucune réponse pour le moment.',

    aucuneDemande: 'Vous n’avez pas de course en cours.',
    proposerUnPrix: 'Proposer un prix',
    votrePrix: 'Vous avez proposé {prix}',
    encore: 'encore {secondes} s',
    encoreMinutes: 'encore {minutes} min',
    demandeExpiree: 'Cette demande a expiré sans réponse.',
    reproposer: 'Proposer un nouveau prix',
    nombre: '{n} conducteur vous répond',
    nombrePluriel: '{n} conducteurs vous répondent',

    contreOffre: 'Contre-offre',
    votrePrixMention: 'votre prix',
    minutes: '{n} min',
    note: '★ {note}',
    sansNote: 'Nouveau',

    accepter: 'Accepter',
    refuser: 'Refuser',
    acceptee: 'Offre acceptée',
    refusee: 'Offre refusée',
    expiree: 'Cette offre a expiré.',
    caduque: 'Ce conducteur a pris une autre course.',

    horsLigne: 'Hors ligne. Les nouvelles offres n’arrivent pas.',
    resynchronisation: 'Mise à jour…',
  },

  conducteur: {
    titre: 'Mode conducteur',
    // « vers Plateau », jamais « Plateau ». La commune vient d'une table de
    // centroïdes approximatifs : le mot de couverture coûte zéro et évite de
    // présenter une approximation comme un fait.
    versCommune: 'vers {commune}',
    demandeEntrante: 'Nouvelle demande',
    prixPropose: 'Prix proposé',
    accepter: 'Accepter',
    contreProposer: 'Contre-proposer',
    refuser: 'Refuser',
    votreContreOffre: 'Votre contre-offre',
    envoyerContreOffre: 'Envoyer ma contre-offre',
    aucuneDemande: 'Aucune demande pour le moment. Restez en ligne.',
  },

  enRoute: {
    titre: 'En route',
    prixConvenu: 'Prix convenu',
    conducteurArrive: 'Votre conducteur arrive',
    plaque: 'Plaque {plaque}',
    terminee: 'Course terminée',
  },

  erreurs: {
    reseau: 'La connexion a été perdue. Vérifiez le réseau et réessayez.',
    demandeExpiree: 'Cette demande a expiré. Proposez un nouveau prix.',
    dejaVerrouillee: 'Cette course vient d’être prise par un autre conducteur.',
    inconnue: 'Quelque chose a échoué. Réessayez.',

    // Messages d'erreur du serveur, traduits par leur code stable. Le serveur
    // renvoie `prix_hors_bornes`, jamais une phrase : la phrase est ici.
    nonAuthentifie: 'Votre session a expiré. Reconnectez-vous.',
    profilAbsent: 'Votre profil est incomplet.',
    prixHorsBornes: 'Ce prix est hors de la fourchette acceptée.',
    prixNonMultipleDe100: 'Le prix se règle par pas de 100 FCFA.',
    demandeDejaOuverte: 'Vous avez déjà une demande en cours.',
  },
} as const;
