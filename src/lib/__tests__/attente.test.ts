import { attenteDepuis } from '../attente';

/**
 * Le délai d'attente affiché. C'est lui qui met la pression dans le bon sens :
 * « attend depuis 2 j » se lit autrement que « en attente ».
 */
describe('attenteDepuis', () => {
  const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();

  it('compte en minutes sous une heure', () => {
    expect(attenteDepuis(ilYA(12 * 60_000))).toEqual({ unite: 'minutes', n: 12 });
  });

  it('en heures au-delà', () => {
    expect(attenteDepuis(ilYA(5 * 3_600_000))).toEqual({ unite: 'heures', n: 5 });
  });

  it('en jours au-delà de vingt-quatre heures', () => {
    expect(attenteDepuis(ilYA(50 * 3_600_000))).toEqual({ unite: 'jours', n: 2 });
  });

  it('jamais de durée négative, même si l’horloge du serveur avance', () => {
    expect(attenteDepuis(new Date(Date.now() + 60_000).toISOString()).n).toBe(0);
  });

  it('une date absente vaut zéro, pas une erreur', () => {
    expect(attenteDepuis(null)).toEqual({ unite: 'minutes', n: 0 });
  });
});
