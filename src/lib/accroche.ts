import { useEffect, useState } from 'react';

import { lire, ecrire } from './stockage';

/**
 * Le mini-tour ne se voit qu'une fois.
 *
 * La marque vit dans le stockage local, PAS dans le profil : elle survit à une
 * déconnexion, et quelqu'un qui se reconnecte ne se refait pas expliquer le
 * produit. Elle ne vaut que pour cette installation, ce qui est exactement la
 * bonne portée — un tour s'adresse à qui découvre l'application sur SON
 * téléphone.
 *
 * ELLE EST RÉACTIVE, ET CE N'EST PAS UN LUXE. La porte de `app/_layout.tsx`
 * décide d'après elle. Si elle se contentait de la lire au montage, « Continuer »
 * poserait la marque au stockage, quitterait le tour, et la porte — qui aurait
 * encore l'ancienne valeur en mémoire — y renverrait aussitôt. Le tour
 * deviendrait inescapable sans se connecter. Le cache de module et son carnet
 * d'abonnés servent uniquement à ce que tout le monde change d'avis en même
 * temps.
 */
const CLE = 'flex.accroche.vue';

let cache: boolean | null = null;
const abonnes = new Set<(vue: boolean) => void>();

export async function accrocheDejaVue(): Promise<boolean> {
  if (cache === null) cache = (await lire(CLE)) === '1';
  return cache;
}

export async function marquerAccrocheVue(): Promise<void> {
  cache = true;
  abonnes.forEach((prevenir) => prevenir(true));
  await ecrire(CLE, '1');
}

/** `null` tant qu'on ne sait pas : on ne redirige pas sur une supposition. */
export function useAccrocheVue(): boolean | null {
  const [vue, setVue] = useState<boolean | null>(cache);

  useEffect(() => {
    let vivant = true;
    if (cache === null) void accrocheDejaVue().then((v) => vivant && setVue(v));
    abonnes.add(setVue);
    return () => {
      vivant = false;
      abonnes.delete(setVue);
    };
  }, []);

  return vue;
}
