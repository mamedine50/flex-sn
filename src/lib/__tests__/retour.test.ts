import { reprendre } from '../retour';

/**
 * Le défaut que ces assertions ferment, trouvé au doigt sur un téléphone :
 * depuis le profil, un balayage vers l'arrière ramenait l'écran « Votre
 * numéro » — déjà connecté, le numéro encore dedans.
 *
 * La cause : la connexion est un PARCOURS. `connexion/index` empile
 * `connexion/code`. Un `replace` final ne remplace que le sommet, et l'écran du
 * dessous survit. On vérifie donc l'ORDRE : vider la pile, puis poser la
 * destination. L'inverse ne réparerait rien.
 */
const appels: string[] = [];

jest.mock('expo-router', () => ({
  router: {
    canDismiss: () => true,
    dismissAll: () => appels.push('dismissAll'),
    replace: (chemin: string) => appels.push(`replace:${chemin}`),
  },
}));

jest.mock('../supabase', () => ({ supabase: { auth: {}, from: () => ({}) } }));

describe('reprendre', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it('vide la pile AVANT de poser la destination', () => {
    reprendre('/profil');
    expect(appels).toEqual(['dismissAll', 'replace:/profil']);
  });

  it('ramène à l’accueil quand il n’y a pas de chemin de retour', () => {
    reprendre(null);
    expect(appels).toEqual(['dismissAll', 'replace:/']);
  });

  it('refuse un chemin qui ne commence pas par une barre', () => {
    // Le chemin vient d'une URL : il ne se croit pas sur parole.
    reprendre('https://ailleurs.example/vol');
    expect(appels).toEqual(['dismissAll', 'replace:/']);
  });

  it('garde les paramètres du chemin — le récap doit revenir REMPLI', () => {
    reprendre('/prix?service=urbain&prix=2500');
    expect(appels).toEqual(['dismissAll', 'replace:/prix?service=urbain&prix=2500']);
  });
});
