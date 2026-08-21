import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Petit tampon autour d'AsyncStorage. Une préférence perdue ne doit jamais
 * empêcher l'application de démarrer : en cas d'échec on retourne `null`.
 */
export async function lire(cle: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(cle);
  } catch {
    return null;
  }
}

export async function ecrire(cle: string, valeur: string): Promise<void> {
  try {
    await AsyncStorage.setItem(cle, valeur);
  } catch {
    // Silencieux : la préférence retombera sur sa valeur par défaut.
  }
}

export async function effacer(cle: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cle);
  } catch {
    // Silencieux, pour la même raison : rien ici ne vaut un démarrage bloqué.
  }
}
