import {
  abonnerMonde,
  basculer,
  mondeCourant,
  reinitialiserMondePourTest,
} from '../monde';

// Le client Supabase refuse de s'importer sans clés — c'est une garde voulue,
// pas un obstacle à contourner. Le magasin n'a besoin de lui que pour écouter la
// fermeture de session, alors on le double.
jest.mock('../supabase', () => ({
  supabase: { auth: { onAuthStateChange: jest.fn() } },
}));

/**
 * Le défaut que ces assertions ferment : le monde vivait dans un `useState` par
 * appelant, donc basculer depuis le Profil ne réveillait pas l'accueil, déjà
 * monté. « Passer en mode conducteur » ramenait à l'accueil passager pendant que
 * « Passer en ligne » fonctionnait — une entrée sur deux, sans que rien dans le
 * code ne le dise.
 *
 * On éprouve donc EXACTEMENT ça : un second abonné, qui n'a pas touché la
 * bascule, voit le changement.
 */
describe('le monde est partagé', () => {
  beforeEach(() => reinitialiserMondePourTest());

  it('démarre passager — on n’ouvre jamais l’application en ligne', () => {
    expect(mondeCourant()).toBe('passager');
  });

  it('un abonné qui n’a PAS basculé est prévenu — les deux entrées se valent', () => {
    const profil = jest.fn();
    const accueil = jest.fn();
    abonnerMonde(profil);
    abonnerMonde(accueil);

    // Le Profil bascule ; c'est l'accueil qui doit changer d'affichage.
    basculer('conducteur');

    expect(mondeCourant()).toBe('conducteur');
    expect(accueil).toHaveBeenCalled();
    expect(profil).toHaveBeenCalled();
  });

  it('le retour ramène tout le monde au passager', () => {
    abonnerMonde(() => {});
    basculer('conducteur');
    const accueil = jest.fn();
    abonnerMonde(accueil);

    basculer('passager');

    expect(mondeCourant()).toBe('passager');
    expect(accueil).toHaveBeenCalled();
  });

  it('rebasculer sur le même monde ne réveille personne', () => {
    basculer('conducteur');
    const temoin = jest.fn();
    abonnerMonde(temoin);

    basculer('conducteur');

    expect(temoin).not.toHaveBeenCalled();
  });

  it('se désabonner coupe vraiment', () => {
    const parti = jest.fn();
    const arret = abonnerMonde(parti);
    arret();

    basculer('conducteur');

    expect(parti).not.toHaveBeenCalled();
  });
});
