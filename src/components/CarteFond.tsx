import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { styleCarte } from '../theme/styleCarte';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Le fond de carte. Affichage seul : aucune recherche de lieu, aucun itinéraire,
 * aucun géocodage — ce sont des appels facturés.
 *
 * Chargé par sous-chemin et APRÈS le premier rendu de l'accueil : la feuille,
 * les tuiles et la barre doivent être tapables avant qu'une seule tuile
 * cartographique n'arrive.
 */

/** Délai au-delà duquel on considère que la carte ne viendra pas. */
const DELAI_CARTE_MS = 6000;

/**
 * Une clé PAR PLATEFORME : une clé Google ne porte qu'un seul type de restriction,
 * iOS par bundle ou Android par SHA-1, et les deux s'excluent. Une clé unique
 * devrait rester sans restriction pour servir les deux.
 *
 * Sans la clé de la plateforme courante, `PROVIDER_GOOGLE` rend une carte grise et
 * muette — le piège exact que décrit CLAUDE.md. On retombe alors sur le
 * fournisseur du système, qui n'en demande pas.
 */
const cleGoogle = Platform.select({
  ios: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY_IOS,
  android: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY_ANDROID,
  default: undefined,
});
export const fournisseurGoogle = Boolean(cleGoogle && cleGoogle.length > 0);

export type EtatCarte = 'attente' | 'prete' | 'indisponible';

type Props = {
  region: Region;
  /** Recentre la carte quand la position arrive, sans reprendre la main ensuite. */
  centrerSur?: { latitude: number; longitude: number } | null;
  onEtat: (etat: Exclude<EtatCarte, 'attente'>) => void;
  children?: ReactNode;
};

export default function CarteFond({ region, centrerSur, onEtat, children }: Props) {
  const { couleurs, theme } = useTheme();
  const carte = useRef<MapView | null>(null);
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    if (prete) return undefined;
    const minuterie = setTimeout(() => onEtat('indisponible'), DELAI_CARTE_MS);
    return () => clearTimeout(minuterie);
  }, [prete, onEtat]);

  useEffect(() => {
    if (!prete || !centrerSur) return;
    carte.current?.animateToRegion(
      { ...centrerSur, latitudeDelta: region.latitudeDelta, longitudeDelta: region.longitudeDelta },
      180,
    );
  }, [prete, centrerSur, region.latitudeDelta, region.longitudeDelta]);

  const surCartePrete = useCallback(() => {
    setPrete(true);
    onEtat('prete');
  }, [onEtat]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={carte}
        style={StyleSheet.absoluteFill}
        // `initialRegion`, jamais `region` : `region` reprend la main à chaque
        // rendu et la carte se bat avec le doigt de l'utilisateur.
        initialRegion={region}
        provider={fournisseurGoogle ? PROVIDER_GOOGLE : undefined}
        customMapStyle={fournisseurGoogle ? styleCarte(couleurs) : undefined}
        userInterfaceStyle={theme}
        onMapReady={surCartePrete}
        // Affichage seul : rien qui déclenche un appel facturé.
        showsPointsOfInterests={false}
        showsTraffic={false}
        showsBuildings={false}
        showsIndoors={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {children}
      </MapView>
    </View>
  );
}
