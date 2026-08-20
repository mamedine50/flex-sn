import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import type { StatutCourse } from './course';
import { doitEmettre } from './geo';
import { supabase } from './supabase';

export { ageSecondes, doitEmettre, etaMinutes } from './geo';

/**
 * Le suivi en direct, des deux côtés.
 *
 * Côté conducteur : le téléphone émet sa position toutes les cinq secondes,
 * UNIQUEMENT pendant une course qui bouge. Un conducteur simplement disponible
 * n'émet rien — sa position n'est lue par personne, et on ne collecte pas ce
 * qu'on ne sert pas.
 *
 * En PREMIER PLAN seulement. La localisation en arrière-plan coûte une
 * dépendance de build, un écran de permission qui fait peur et une batterie
 * mangée ; pour la V1 on préfère assumer que la position gèle quand le
 * conducteur quitte l'application, et le DIRE au passager.
 */

/** Cadence d'émission. Cinq secondes suffisent à une voiture en ville. */
export const PERIODE_EMISSION_MS = 5000;

/** Au-delà, l'écran passager annonce l'âge de la position au lieu de mentir. */
export const POSITION_PERIMEE_MS = 15000;

/** Émission de la position du conducteur pendant sa course. */
export function useEmissionPosition(statut: StatutCourse | null | undefined) {
  useEffect(() => {
    if (!doitEmettre(statut)) return undefined;

    let vivant = true;

    const emettre = async () => {
      try {
        const { coords } = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!vivant) return;
        await supabase.rpc('maj_position', {
          p_lat: coords.latitude,
          p_lon: coords.longitude,
          p_en_ligne: true,
          p_cap:
            typeof coords.heading === 'number' && coords.heading >= 0
              ? Math.round(coords.heading) % 360
              : undefined,
        });
      } catch {
        // Un point manqué n'est pas un incident : le suivant arrive dans cinq
        // secondes, et l'écran passager sait afficher l'âge de la position.
      }
    };

    void emettre();
    const battement = setInterval(() => void emettre(), PERIODE_EMISSION_MS);

    return () => {
      vivant = false;
      clearInterval(battement);
    };
  }, [statut]);
}

export type PositionSuivie = {
  latitude: number;
  longitude: number;
  cap: number | null;
  majLe: number;
};

/**
 * Interpolation entre deux positions.
 *
 * Sans elle le marqueur saute de cinq secondes en cinq secondes, ce qui se lit
 * comme un bug d'affichage avant de se lire comme une voiture. On glisse donc
 * de l'ancienne position vers la nouvelle sur la durée d'une période.
 */
export function useMarqueurLisse(cible: PositionSuivie | null) {
  const [affichee, setAffichee] = useState<PositionSuivie | null>(null);
  const precedente = useRef<PositionSuivie | null>(null);

  useEffect(() => {
    if (!cible) return undefined;

    const depart = precedente.current;
    precedente.current = cible;

    // Première position connue : rien à interpoler, et `affichee ?? cible`
    // ci-dessous l'affiche déjà. Aucun `setState` synchrone ici.
    if (!depart) return undefined;

    const debut = Date.now();
    const image = setInterval(() => {
      const t = Math.min(1, (Date.now() - debut) / PERIODE_EMISSION_MS);
      setAffichee({
        latitude: depart.latitude + (cible.latitude - depart.latitude) * t,
        longitude: depart.longitude + (cible.longitude - depart.longitude) * t,
        cap: cible.cap ?? depart.cap,
        majLe: cible.majLe,
      });
      if (t >= 1) clearInterval(image);
    }, 100);

    return () => clearInterval(image);
  }, [cible]);

  // Tant qu'aucune image d'interpolation n'a été produite, on rend la cible :
  // mieux vaut une voiture au bon endroit qu'une voiture absente.
  return affichee ?? cible;
}
