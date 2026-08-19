import * as SecureStore from 'expo-secure-store';

/**
 * Stockage de la session Supabase — dans le trousseau, pas en clair.
 *
 * Une session Supabase contient un jeton de rafraîchissement : c'est une
 * crédential, pas une préférence. AsyncStorage l'écrirait en clair sur le
 * disque, et sur un téléphone rooté — courant sur l'entrée de gamme — ça vaut
 * une reprise de compte.
 *
 * `SecureStore` plafonne chaque valeur à 2048 octets et une session dépasse
 * parfois, selon les revendications du jeton. On découpe donc en tranches, avec
 * un index qui dit combien il y en a. Sans le découpage, l'écriture échoue en
 * silence le jour où le jeton grossit — et l'utilisateur se retrouve
 * déconnecté sans raison visible.
 */
const TAILLE_TRANCHE = 1800;

function cleTranche(cle: string, i: number) {
  return `${cle}.${i}`;
}

export const stockageSecurise = {
  async getItem(cle: string): Promise<string | null> {
    try {
      const nombre = await SecureStore.getItemAsync(cle);
      if (nombre === null) return null;

      const total = Number.parseInt(nombre, 10);
      if (!Number.isInteger(total) || total < 1) return null;

      const tranches: string[] = [];
      for (let i = 0; i < total; i += 1) {
        const tranche = await SecureStore.getItemAsync(cleTranche(cle, i));
        // Une tranche manquante rend la valeur inutilisable : mieux vaut une
        // session absente qu'une session tronquée.
        if (tranche === null) return null;
        tranches.push(tranche);
      }
      return tranches.join('');
    } catch {
      return null;
    }
  },

  async setItem(cle: string, valeur: string): Promise<void> {
    try {
      await stockageSecurise.removeItem(cle);

      const tranches: string[] = [];
      for (let i = 0; i < valeur.length; i += TAILLE_TRANCHE) {
        tranches.push(valeur.slice(i, i + TAILLE_TRANCHE));
      }

      for (let i = 0; i < tranches.length; i += 1) {
        await SecureStore.setItemAsync(cleTranche(cle, i), tranches[i] as string);
      }
      await SecureStore.setItemAsync(cle, String(tranches.length));
    } catch {
      // Un stockage indisponible ne doit pas faire tomber l'application : la
      // session vivra en mémoire jusqu'à la fermeture.
    }
  },

  async removeItem(cle: string): Promise<void> {
    try {
      const nombre = await SecureStore.getItemAsync(cle);
      const total = nombre === null ? 0 : Number.parseInt(nombre, 10);

      for (let i = 0; i < (Number.isInteger(total) ? total : 0); i += 1) {
        await SecureStore.deleteItemAsync(cleTranche(cle, i));
      }
      await SecureStore.deleteItemAsync(cle);
    } catch {
      // Idem : on n'empêche pas une déconnexion pour un échec de trousseau.
    }
  },
};
