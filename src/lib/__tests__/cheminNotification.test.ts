import { cheminNotification } from '../cheminNotification';

/**
 * La table qui dit où mène une notification — celle de la boîte comme celle
 * d'un push reçu écran verrouillé. Elle était écrite deux fois ; ce test la
 * garde unique et complète.
 */
describe('cheminNotification', () => {
  it('une offre reçue mène aux offres', () => {
    expect(cheminNotification('offre_recue')).toBe('/offres');
  });

  it('le conducteur arrivé mène à la course', () => {
    expect(cheminNotification('conducteur_arrive')).toBe('/course');
  });

  it('un message mène à la course, où vit le fil', () => {
    expect(cheminNotification('message')).toBe('/course');
  });

  it('un dossier tranché mène au dossier', () => {
    expect(cheminNotification('document_decide')).toBe('/devenir-conducteur');
  });

  it('un genre inconnu mène à la boîte, JAMAIS nulle part', () => {
    // Le cas qui compte : quelqu'un ajoute un genre en base sans passer ici.
    expect(cheminNotification('quelque_chose_de_neuf')).toBe('/notifications');
    expect(cheminNotification(null)).toBe('/notifications');
    expect(cheminNotification(undefined)).toBe('/notifications');
  });
});
