import { ancrePrix } from '../ancragePrix';

/**
 * Le prix suit-il le trajet ?
 *
 * Le défaut signalé : on tape 2 000 AVANT d'avoir choisi une destination, on
 * désigne ensuite Mermoz, et le chiffre ne bouge pas. L'écran a l'air de ne
 * rien calculer — et pour cause : il traitait un prix choisi dans le vide
 * comme une décision.
 */
describe('ancrePrix', () => {
  it('un prix tapé SANS trajet cède à la recommandation', () => {
    // C'est le cas signalé : rien ne permettait de choisir 2 000.
    expect(ancrePrix({ prix: 2000, repondu: false, recommande: 1700 })).toBe(1700);
  });

  it('un prix choisi POUR ce trajet ne bouge pas', () => {
    expect(ancrePrix({ prix: 2500, repondu: true, recommande: 1700 })).toBe(2500);
  });

  it('un champ vide prend la recommandation', () => {
    expect(ancrePrix({ prix: null, repondu: true, recommande: 1700 })).toBe(1700);
  });

  it('sans recommandation, on ne touche à rien', () => {
    // Tarif non renseigné : le champ reste tel quel, vide ou non.
    expect(ancrePrix({ prix: 2000, repondu: false, recommande: null })).toBe(2000);
    expect(ancrePrix({ prix: null, repondu: false, recommande: null })).toBe(null);
  });
});
