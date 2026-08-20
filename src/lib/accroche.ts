import { lire, ecrire } from './stockage';

/**
 * L'accroche ne se voit qu'une fois.
 *
 * La marque vit dans le stockage local, PAS dans le profil : elle survit à une
 * déconnexion, et quelqu'un qui se reconnecte ne se refait pas expliquer le
 * produit. Elle ne vaut que pour cette installation, ce qui est exactement la
 * bonne portée — une accroche s'adresse à qui découvre l'application sur SON
 * téléphone.
 */
const CLE = 'flex.accroche.vue';

export async function accrocheDejaVue(): Promise<boolean> {
  return (await lire(CLE)) === '1';
}

export async function marquerAccrocheVue(): Promise<void> {
  await ecrire(CLE, '1');
}
