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
  },

  offres: {
    titre: 'Offres reçues',
    attente: 'Votre proposition est partie. Les réponses arrivent ici.',
    vide: 'Aucune réponse pour le moment.',
    contreOffre: 'Contre-offre',
    arriveeDans: 'Arrive dans {minutes} min',
    note: '{note}',
    accepter: 'Accepter',
    refuser: 'Refuser',
    acceptee: 'Offre acceptée',
    refusee: 'Offre refusée',
    expiree: 'Cette offre a expiré.',
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
  },
} as const;
