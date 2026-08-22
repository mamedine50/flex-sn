import { PAYS, chercherPays, drapeau } from '../pays';
import { normaliser } from '../recherche';

const nomDe = (p: { nom: string }) => p.nom;
const chercher = (q: string) => chercherPays(PAYS, q, normaliser, nomDe);

describe('chercherPays', () => {
  it('« c » ne rend PAS toute la liste — c’est le défaut trouvé au doigt', () => {
    expect(chercher('c').length).toBeLessThan(PAYS.length);
  });

  it('et le Canada est en tête : ce qui COMMENCE par la recherche passe devant', () => {
    const noms = chercher('c').map((p) => p.nom);
    const canada = noms.indexOf('Canada');
    expect(canada).toBeGreaterThanOrEqual(0);
    // Aucun pays qui ne commence pas par « c » ne doit le précéder.
    expect(
      noms.slice(0, canada).every((n) => normaliser(n).startsWith('c')),
    ).toBe(true);
  });

  it('trouve par indicatif quand on tape des chiffres', () => {
    expect(chercher('221')[0]?.nom).toBe('Sénégal');
    expect(chercher('+1')[0]?.indicatif).toBe('1');
  });

  it('ignore les accents et la casse', () => {
    expect(chercher('SENEGAL')[0]?.nom).toBe('Sénégal');
    expect(chercher('sénég')[0]?.nom).toBe('Sénégal');
  });

  it('rend tout sur une recherche vide', () => {
    expect(chercher('').length).toBe(PAYS.length);
    expect(chercher('   ').length).toBe(PAYS.length);
  });

  it('rend une liste vide quand rien ne correspond', () => {
    expect(chercher('zzzz')).toEqual([]);
  });

  it('garde le Sénégal devant à l’intérieur d’un groupe', () => {
    // « s » : Sénégal commence par s, il doit rester le premier de son groupe.
    expect(chercher('s')[0]?.nom).toBe('Sénégal');
  });
});

describe('drapeau', () => {
  it('calcule le drapeau depuis le code ISO, sans image embarquée', () => {
    expect(drapeau('SN')).toBe('🇸🇳');
    expect(drapeau('CA')).toBe('🇨🇦');
  });
});
