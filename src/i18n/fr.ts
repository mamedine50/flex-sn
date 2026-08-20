/**
 * Français — langue de référence. Toute clé existe ici en premier ; les autres
 * langues se comparent à ce fichier.
 *
 * Voix active. Un bouton dit ce qui se passe.
 */
export const fr = {
  onglets: {
    accueil: 'Course',
    profil: 'Profil',
  },

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
    systeme: 'Auto',
    clair: 'Clair',
    sombre: 'Sombre',
  },

  accueil: {
    reprendreCourse: 'Course en cours',
    reprendreCourseSous: 'Revenir au suivi',
    reprendreOffres: 'Proposition en cours',
    reprendreOffresSous: 'Voir les réponses',
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
    chercherQuartier: 'Chercher un quartier — Yoff, SICAP, Plateau…',
    aucuneVille: 'Aucune ville ne correspond.',

    // Le repère est fixe, c'est la carte qui bouge dessous.
    reperePosition: 'Déplacez la carte pour placer le repère',
    precisionFacultative: 'Précisez : devant la pharmacie, entrée du terrain…',
    pointSurLaCarte: 'Point sur la carte',
    confirmerCePoint: 'Confirmer ce point',

    // « Recommandé à partir de », jamais « suggéré » ni « environ » : c'est un
    // MINIMUM que le passager peut dépasser, pas un milieu autour duquel viser.
    recommandeAPartirDe: 'Recommandé à partir de {prix}',
    saisirPrix: 'Entrez votre prix',
    interurbainSansRecommandation:
      'Pas de recommandation sur l’interurbain : proposez votre prix.',
    peagesNonCompris: 'Péages non compris.',
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
    annulerDemande: 'Annuler ma demande',
    confirmerAnnulation: 'Retirer votre demande ?',
    confirmerAnnulationAide: 'Les conducteurs cesseront de la voir, et les offres en attente tombent.',
    annulationEnCours: 'Retrait…',
    garder: 'La garder',
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

    accepter: 'Accepter',
    refuser: 'Refuser',
    acceptee: 'Offre acceptée',
    refusee: 'Offre refusée',
    expiree: 'Cette offre a expiré.',
    caduque: 'Ce conducteur a pris une autre course.',

    horsLigne: 'Hors ligne. Les nouvelles offres n’arrivent pas.',
    resynchronisation: 'Mise à jour…',
  },

  dossier: {
    titre: 'Conduire avec Flex',
    intro: 'Quatre pièces à fournir. Nous les vérifions à la main, sous 48 heures.',
    piece_identite: 'Pièce d’identité',
    piece_identiteAide: 'Carte nationale ou passeport, recto lisible',
    permis: 'Permis de conduire',
    permisAide: 'En cours de validité',
    carte_grise: 'Carte grise',
    carte_griseAide: 'Du véhicule que vous conduirez',
    selfie: 'Photo de vous',
    selfieAide: 'Visage dégagé, elle sera comparée à votre pièce',

    ajouter: 'Ajouter',
    remplacer: 'Remplacer',
    en_attente: 'En vérification',
    valide: 'Validé',
    refuse: 'À refaire',

    complet: 'Votre dossier est complet.',
    completAide: 'Le mode conducteur est ouvert depuis votre profil.',
    enCours: 'Dossier en vérification.',
    enCoursAide: 'Nous revenons vers vous sous 48 heures.',
    manquant: 'Il manque {n} pièce.',
    manquantPluriel: 'Il manque {n} pièces.',

    erreurPermission: 'Flex a besoin de l’accès à vos photos pour cette pièce.',
    erreurEnvoi: 'L’envoi a échoué. Vérifiez le réseau et réessayez.',
    envoiEnCours: 'Envoi…',

    photo: 'Photo de profil',
    photoAide: 'Elle apparaît sur vos offres. Ce n’est pas une pièce du dossier.',
    photoPosee: 'En place',
    vehicule: 'Votre véhicule',
    vehiculeManquant: 'Il reste votre véhicule à déclarer.',
    vehiculeManquantAide: 'Vos pièces sont validées. Le mode conducteur s’ouvrira dès que la voiture sera renseignée.',
    vehiculeAide: 'Ce que le passager verra arriver.',
    plaque: 'Plaque',
    plaquePlaceholder: 'DK-1234-A',
    modele: 'Modèle',
    modelePlaceholder: 'Kia Picanto',
    couleur: 'Couleur',
    couleurPlaceholder: 'grise',
    enregistrer: 'Enregistrer',
    vehiculeEnregistre: 'Enregistré',
    horsLigne: 'Hors ligne. L’envoi d’une pièce demande le réseau.',
    illisible: 'Votre dossier ne se charge pas.',
    illisibleAide: 'Rien n’est perdu : les pièces déjà envoyées sont en base.',
  },

  profil: {
    titre: 'Profil',
    apparence: 'Apparence',
    langue: 'Langue',
    compte: 'Compte',
    conduire: 'Conduire avec Flex',
    conduireSous: 'Gagnez de l’argent avec votre véhicule',
    modeConducteur: 'Mode conducteur',
    modeConducteurSous: 'Voir les demandes à proximité',
    seDeconnecter: 'Se déconnecter',
    confirmerDeconnexion: 'Se déconnecter de Flex ?',
    nonConnecte: 'Vous n’êtes pas connecté.',
    seConnecter: 'Se connecter',
    membreDepuis: 'Membre depuis {date}',
    courses: '{n} course',
    coursesPluriel: '{n} courses',
    nouveauConducteur: 'Nouveau conducteur',
    gainsSemaine: 'Cette semaine',
    gainsTotal: 'Total {montant}',
    gainsCommission: '0 % de commission. Vous gardez tout.',
    gainsVide: 'Votre première course apparaîtra ici.',
    application: 'Application',
    aPropos: 'À propos',
    aProposSous: 'Version, cartes et licences',
  },

  conducteur: {
    titre: 'Mode conducteur',
    // « vers Plateau », jamais « Plateau ». La commune vient d'une table de
    // centroïdes approximatifs : le mot de couverture coûte zéro et évite de
    // présenter une approximation comme un fait.
    versCommune: 'vers {commune}',

    enLigne: 'En ligne',
    horsLigne: 'Hors ligne',
    passerEnLigne: 'Passer en ligne',
    passerHorsLigne: 'Passer hors ligne',
    horsLigneInvite: 'Vous êtes hors ligne. Aucune demande ne vous parvient.',
    aucuneDemande: 'Aucune demande à proximité. Restez en ligne.',
    positionRequise: 'Activez la localisation pour recevoir les demandes proches.',

    pasConducteur: 'Vous n’êtes pas encore conducteur.',
    pasConducteurAide:
      'Il faut des documents validés et un véhicule actif. Contactez le support.',

    prixPropose: 'Prix proposé',
    depuis: 'Départ {commune}',
    versDestination: 'Vers {commune}',
    arriveeEstimee: 'à {minutes} min de vous',

    accepterA: 'Accepter à {prix}',
    contreProposer: 'Contre-proposer',
    refuser: 'Refuser',

    votreContreOffre: 'Votre contre-offre',
    votreDelai: 'Vous arrivez dans',
    envoyerContreOffre: 'Envoyer ma contre-offre',
    envoiEnCours: 'Envoi…',
    minutes: '{n} min',

    expiree: 'Cette demande a expiré.',
    reseauCoupe: 'Hors ligne. Les demandes n’arrivent plus.',
  },

  enRoute: {
    titre: 'En route',
    prixConvenu: 'Prix convenu',
    conducteurArrive: 'Votre conducteur arrive',
    plaque: 'Plaque {plaque}',
    terminee: 'Course terminée',

    // Le cycle, vu du passager puis du conducteur.
    verrouillee: 'Course confirmée',
    verrouilleeConducteur: 'Prévenez le passager que vous partez',
    en_route: 'Votre conducteur est en route',
    en_routeConducteur: 'Vous êtes en route',
    arrive: 'Votre conducteur est arrivé',
    arriveConducteur: 'Vous êtes sur place',
    commencee: 'Course en cours',
    commenceeConducteur: 'Course en cours',
    annulee: 'Course annulée',

    // Les actions du conducteur, une par étape.
    partir: 'Je pars',
    signalerArrivee: 'Je suis arrivé',
    demarrer: 'Démarrer la course',
    terminer: 'Terminer la course',

    appeler: 'Appeler',
    ecrire: 'Écrire',
    annuler: 'Annuler la course',
    confirmerAnnulation: 'Annuler cette course ?',
    confirmerAnnulationAide: 'L’autre personne en sera prévenue immédiatement.',
    garderLaCourse: 'Garder la course',
    annuleePar: 'Annulée par {prenom}',
    annuleeParVous: 'Vous avez annulé cette course.',

    immobile: 'Votre conducteur n’a pas bougé depuis {minutes} min.',
    positionDatee: 'Position il y a {secondes} s.',
    etaPriseEnCharge: 'Arrivée estimée dans {minutes} min',
    etaArrivee: 'Vous arrivez dans {minutes} min',
    horsLigne: 'Hors ligne. Le suivi reprendra au retour du réseau.',
    resynchronisation: 'Mise à jour…',
    aucuneCourse: 'Vous n’avez pas de course en cours.',

    // Notation en double aveugle.
    noter: 'Comment s’est passée la course ?',
    noterAide: 'Votre note reste cachée jusqu’à ce que l’autre ait noté.',
    envoyerNote: 'Envoyer ma note',
    dejaNote: 'Merci, votre note est enregistrée.',
    dejaNoteAide: 'Elle sera visible quand l’autre aura noté, ou dans sept jours.',
    etoiles: '{n} sur 5',
  },

  aPropos: {
    titre: 'À propos',
    version: 'Version {version}',
    cartes: 'Cartes et lieux',
    osmAttribution: '© contributeurs OpenStreetMap',
    osmLicence: 'Les quartiers, arrêts et repères de Flex viennent d’OpenStreetMap, sous licence ODbL. La base reste libre, et les données qui en dérivent le restent aussi.',
    osmLien: 'openstreetmap.org/copyright',
    fondCarte: 'Le fond de carte est fourni par la plateforme — Google sur Android, Apple sur iOS.',
  },

  connexion: {
    titreNumero: 'Votre numéro',
    aideNumero: 'Vous recevrez un code par SMS.',
    indicatif: 'Indicatif',
    numero: 'Numéro',
    recevoirCode: 'Recevoir le code',
    envoiEnCours: 'Envoi…',

    titreCode: 'Votre code',
    aideCode: 'Envoyé au {numero}.',
    verification: 'Vérification…',
    renvoyer: 'Renvoyer le code',
    renvoyerDans: 'Renvoyer dans {secondes} s',
    modifierNumero: 'Modifier le numéro',
    pasRecu: 'Rien reçu ? Vérifiez le numéro, puis renvoyez le code.',

    titrePrenom: 'Votre prénom',
    aidePrenom: 'C’est le nom que verront les conducteurs.',
    prenom: 'Prénom',
    continuer: 'Continuer',

    horsLigne: 'Hors ligne. La connexion demande le réseau.',
  },

  erreurs: {
    plaquePrise: 'Cette plaque est déjà déclarée par un autre conducteur.',
    plaqueInvalide: 'Une plaque compte au moins quatre caractères.',
    cheminEtranger: 'Ce fichier ne vous appartient pas.',
    demandeIndisponible: 'Cette demande n’est plus active.',
    numeroInvalide: 'Ce numéro n’est pas valide. Vérifiez l’indicatif et les chiffres.',
    codeInvalide: 'Ce code ne correspond pas. Retapez-le.',
    codeExpire: 'Ce code a expiré. Demandez-en un nouveau.',
    tropDeTentatives: 'Trop de tentatives. Réessayez dans une minute.',
    smsIndisponible: 'L’envoi de SMS n’est pas encore branché. Utilisez le panneau de développement.',
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
    documentsNonValides: 'Vos documents conducteur ne sont pas encore validés.',
    vehiculeAbsent: 'Aucun véhicule actif sur votre compte.',
    demandeASoi: 'C’est votre propre demande.',
    offreDejaSoumise: 'Vous avez déjà répondu à cette demande.',
    conducteurIndisponible: 'Vous avez déjà une course en cours.',
    prixIncoherent: 'Ce prix ne correspond pas à la demande.',
    contreOffreIdentique: 'Proposez un prix différent de celui du passager.',
    courseEtrangere: 'Cette course n’est pas la vôtre.',
    courseIntrouvable: 'Cette course n’existe plus.',
    courseDejaAnnulee: 'Cette course vient d’être annulée.',
    courseCommencee: 'La course a commencé : elle se termine, elle ne s’annule plus.',
    courseNonTerminee: 'On note une course une fois terminée.',
    dejaNote: 'Vous avez déjà noté cette course.',
    etapeInvalide: 'Cette étape n’est pas la suivante.',
  },
} as const;
