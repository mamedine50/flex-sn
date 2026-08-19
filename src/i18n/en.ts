/**
 * English — same shape as `fr.ts`. TypeScript refuses a missing key.
 */
import type { Dictionnaire } from './types';

export const en: Dictionnaire = {
  commun: {
    annuler: 'Cancel',
    continuer: 'Continue',
    retour: 'Back',
    fermer: 'Close',
    reessayer: 'Try again',
    chargement: 'One moment…',
    appeler: 'Call',
    ecrire: 'Message',
  },

  langues: {
    titre: 'Language',
    fr: 'Français',
    en: 'English',
    wo: 'Wolof',
  },

  theme: {
    titre: 'Appearance',
    systeme: 'Match the phone',
    clair: 'Light',
    sombre: 'Dark',
  },

  accueil: {
    ou: 'Where are you going?',
    urbain: 'City ride',
    urbainSous: 'Set your price',
    interurbain: 'City to city',
    interurbainSous: 'Intercity rides',

    pointDepart: 'Pickup point',
    choisirDepart: 'Choose my pickup point',
    localisationEnCours: 'Finding your position…',
    maPosition: 'My position',
    localisationRefusee: 'Location turned off',
    ouvrirReglages: 'Open settings',

    horsLigne: 'Offline. You can still plan your ride.',
    carteIndisponible: 'The map is not loading.',
    carteIndisponibleAide: 'Check your network. The rest of the screen works.',
  },

  prix: {
    titre: 'Set your price',
    depart: 'Pickup',
    destination: 'Destination',
    montant: 'Your price',
    baisser: 'Lower by 100 F',
    monter: 'Raise by 100 F',
    fourchette: 'Drivers usually accept between {min} and {max}',
    envoyer: 'Send my offer',
    tropBas: 'This price is below {min}. Few drivers will answer.',
    tropHaut: 'This price is above {max}.',

    choisirDepart: 'Choose pickup',
    choisirDestination: 'Choose destination',
    chercherVille: 'Search a city',
    aucuneVille: 'No city matches.',

    reperePosition: 'Move the map to place the pin',
    precisionFacultative: 'Add detail: by the pharmacy, gate of the pitch…',
    pointSurLaCarte: 'Point on the map',
    confirmerCePoint: 'Confirm this point',

    recommandeAPartirDe: 'Recommended from {prix}',
    saisirPrix: 'Enter your price',
    interurbainSansRecommandation:
      'No recommendation for intercity rides: name your price.',
    peagesNonCompris: 'Tolls not included.',
    prixManquant: 'Enter the price you are offering.',

    bornesEnCours: 'Loading the price range…',
    bornesIndisponibles: 'The price range could not be loaded.',
    bornesIndisponiblesAide: 'Without it, any price would be rejected. Try again.',

    envoiEnCours: 'Sending…',
    horsLigne: 'Offline. Your offer will go out when the network returns.',
    departManquant: 'Set your pickup point.',
    destinationManquante: 'Set where you are going.',
  },

  offres: {
    titre: 'Offers received',
    attente: 'Your offer is out. Answers land here.',
    vide: 'No answer yet.',

    aucuneDemande: 'You have no ride in progress.',
    proposerUnPrix: 'Offer a price',
    votrePrix: 'You offered {prix}',
    encore: '{secondes} s left',
    encoreMinutes: '{minutes} min left',
    demandeExpiree: 'This request expired with no answer.',
    reproposer: 'Offer a new price',
    nombre: '{n} driver replied',
    nombrePluriel: '{n} drivers replied',

    contreOffre: 'Counter-offer',
    votrePrixMention: 'your price',
    minutes: '{n} min',
    note: '★ {note}',
    sansNote: 'New',

    accepter: 'Accept',
    refuser: 'Decline',
    acceptee: 'Offer accepted',
    refusee: 'Offer declined',
    expiree: 'This offer has expired.',
    caduque: 'This driver took another ride.',

    horsLigne: 'Offline. New offers are not coming in.',
    resynchronisation: 'Updating…',
  },

  conducteur: {
    titre: 'Driver mode',
    versCommune: 'towards {commune}',

    enLigne: 'Online',
    horsLigne: 'Offline',
    passerEnLigne: 'Go online',
    passerHorsLigne: 'Go offline',
    horsLigneInvite: 'You are offline. No request reaches you.',
    aucuneDemande: 'No request nearby. Stay online.',
    positionRequise: 'Turn on location to receive nearby requests.',

    pasConducteur: 'You are not a driver yet.',
    pasConducteurAide: 'You need validated documents and an active vehicle. Contact support.',

    prixPropose: 'Offered price',
    depuis: 'From {commune}',
    versDestination: 'To {commune}',
    arriveeEstimee: '{minutes} min from you',

    accepterA: 'Accept at {prix}',
    contreProposer: 'Counter',
    refuser: 'Decline',

    votreContreOffre: 'Your counter-offer',
    votreDelai: 'You arrive in',
    envoyerContreOffre: 'Send my counter-offer',
    envoiEnCours: 'Sending…',
    minutes: '{n} min',

    expiree: 'This request has expired.',
    reseauCoupe: 'Offline. Requests are not coming in.',
  },

  enRoute: {
    titre: 'On the way',
    prixConvenu: 'Agreed price',
    conducteurArrive: 'Your driver is on the way',
    plaque: 'Plate {plaque}',
    terminee: 'Ride complete',
  },

  erreurs: {
    reseau: 'The connection dropped. Check your network and try again.',
    demandeExpiree: 'This request has expired. Set a new price.',
    dejaVerrouillee: 'Another driver just took this ride.',
    inconnue: 'Something failed. Try again.',

    nonAuthentifie: 'Your session expired. Sign in again.',
    profilAbsent: 'Your profile is incomplete.',
    prixHorsBornes: 'This price is outside the accepted range.',
    prixNonMultipleDe100: 'Price moves in steps of 100 FCFA.',
    demandeDejaOuverte: 'You already have a request in progress.',
    documentsNonValides: 'Your driver documents are not validated yet.',
    vehiculeAbsent: 'No active vehicle on your account.',
    demandeASoi: 'This is your own request.',
    offreDejaSoumise: 'You already answered this request.',
    conducteurIndisponible: 'You already have a ride in progress.',
    prixIncoherent: 'This price does not match the request.',
    contreOffreIdentique: 'Offer a price different from the passenger’s.',
  },
};
