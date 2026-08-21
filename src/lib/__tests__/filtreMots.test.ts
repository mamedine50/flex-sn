import { contientGrossierete, masquerGrossieretes } from '../filtreMots';

describe('masquerGrossieretes', () => {
  it('masque un mot en clair, en gardant sa longueur', () => {
    expect(masquerGrossieretes('quel connard')).toBe('quel *******');
  });

  it('ne se laisse pas avoir par la casse ni les accents', () => {
    expect(masquerGrossieretes('ENCULÉ')).toBe('******');
    expect(masquerGrossieretes('Bâtard')).toBe('******');
  });

  it('garde la ponctuation et les espaces', () => {
    expect(masquerGrossieretes('Bonjour, merde !')).toBe('Bonjour, ***** !');
  });

  it('laisse le texte honnête intact — c’est le cas le plus fréquent', () => {
    const avis = 'Chauffeur ponctuel, voiture propre. Je recommande.';
    expect(masquerGrossieretes(avis)).toBe(avis);
  });

  it('ne mange PAS un mot qui contient un mot interdit', () => {
    // Le piège des listes : comparer sur des fragments étoile des mots
    // innocents, et l'application a l'air cassée.
    expect(masquerGrossieretes('un rattrapage')).toBe('un rattrapage');
    expect(masquerGrossieretes('la chienlit')).toBe('la chienlit');
    expect(masquerGrossieretes('Konna')).toBe('Konna');
  });

  it('masque chaque occurrence, pas seulement la première', () => {
    expect(masquerGrossieretes('pute et pute')).toBe('**** et ****');
  });

  it('supporte le vide', () => {
    expect(masquerGrossieretes('')).toBe('');
  });
});

describe('contientGrossierete', () => {
  it('dit vrai quand il y a quelque chose à masquer', () => {
    expect(contientGrossierete('espèce de salope')).toBe(true);
  });

  it('dit faux sur un avis ordinaire', () => {
    expect(contientGrossierete('Très bien, merci beaucoup.')).toBe(false);
  });
});
