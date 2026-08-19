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
  },

  offres: {
    titre: 'Offers received',
    attente: 'Your offer is out. Answers land here.',
    vide: 'No answer yet.',
    contreOffre: 'Counter-offer',
    arriveeDans: 'Arrives in {minutes} min',
    note: '{note}',
    accepter: 'Accept',
    refuser: 'Decline',
    acceptee: 'Offer accepted',
    refusee: 'Offer declined',
    expiree: 'This offer has expired.',
  },

  conducteur: {
    titre: 'Driver mode',
    demandeEntrante: 'New request',
    prixPropose: 'Offered price',
    accepter: 'Accept',
    contreProposer: 'Counter',
    refuser: 'Decline',
    votreContreOffre: 'Your counter-offer',
    envoyerContreOffre: 'Send my counter-offer',
    aucuneDemande: 'No request right now. Stay online.',
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
  },
};
