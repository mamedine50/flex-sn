import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

/**
 * La position du point de départ, et ses états.
 *
 * On ne demande JAMAIS la permission au montage. Une demande système qui tombe
 * avant que l'utilisateur ait compris l'écran se fait refuser, et un refus ne se
 * redemande pas. L'écran fonctionne sans, la pastille invite à choisir.
 */
export type EtatLocalisation =
  | 'jamais_demandee'
  | 'en_cours'
  | 'obtenue'
  | 'refusee'
  | 'indisponible';

export type Position = { latitude: number; longitude: number };

export function useLocalisation() {
  const [etat, setEtat] = useState<EtatLocalisation>('jamais_demandee');
  const [position, setPosition] = useState<Position | null>(null);

  const acquerir = useCallback(async () => {
    setEtat('en_cours');
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setPosition({ latitude: coords.latitude, longitude: coords.longitude });
      setEtat('obtenue');
    } catch {
      // Le GPS peut échouer sans que la permission soit en cause : en intérieur,
      // en mode avion. Ce n'est pas un refus, et ça ne se traite pas pareil.
      setEtat('indisponible');
    }
  }, []);

  // Au montage : on lit la permission déjà accordée, on n'en demande aucune.
  useEffect(() => {
    let vivant = true;
    void (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (!vivant) return;
      if (status === Location.PermissionStatus.GRANTED) void acquerir();
      else if (status === Location.PermissionStatus.DENIED) setEtat('refusee');
    })();
    return () => {
      vivant = false;
    };
  }, [acquerir]);

  /** Sur appui de la pastille. Une seule demande, jamais de boucle de relance. */
  const demander = useCallback(async () => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) {
      void acquerir();
      return;
    }
    setEtat('refusee');
    // Refus définitif : la seule issue est les réglages du téléphone. Redemander
    // n'afficherait plus rien et donnerait l'impression d'un bouton mort.
    if (!canAskAgain) void Linking.openSettings();
  }, [acquerir]);

  const ouvrirReglages = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return { etat, position, demander, ouvrirReglages };
}
