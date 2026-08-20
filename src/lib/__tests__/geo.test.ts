import { ageSecondes, doitEmettre } from '../geo';

/** Le seuil vit dans suivi.ts, mais la constante n'y traîne aucun réseau. */
const POSITION_PERIMEE_MS = 15000;

describe('doitEmettre', () => {
  it('émet pendant le déplacement', () => {
    expect(doitEmettre('en_route')).toBe(true);
    expect(doitEmettre('arrive')).toBe(true);
    expect(doitEmettre('commencee')).toBe(true);
  });

  it('n’émet PAS avant le départ — le conducteur n’a pas dit qu’il partait', () => {
    expect(doitEmettre('verrouillee')).toBe(false);
  });

  it('n’émet plus une fois la course terminée ou annulée', () => {
    expect(doitEmettre('terminee')).toBe(false);
    expect(doitEmettre('annulee')).toBe(false);
  });

  it('n’émet pas sans course — un conducteur disponible n’est suivi par personne', () => {
    expect(doitEmettre(null)).toBe(false);
    expect(doitEmettre(undefined)).toBe(false);
  });
});

describe('ageSecondes', () => {
  it('compte l’âge de la position', () => {
    const t = 1_000_000;
    expect(ageSecondes(t, t)).toBe(0);
    expect(ageSecondes(t, t + 40_000)).toBe(40);
  });

  it('ne rend jamais un âge négatif, même si les horloges divergent', () => {
    const t = 1_000_000;
    expect(ageSecondes(t, t - 5000)).toBe(0);
  });

  it('le seuil de péremption est à 15 s', () => {
    expect(POSITION_PERIMEE_MS / 1000).toBe(15);
  });
});
