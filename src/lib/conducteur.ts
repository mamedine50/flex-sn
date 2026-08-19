import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Le côté conducteur : capacité, mise en ligne, file des demandes proches.
 */
export type DemandeProche = Database['public']['Views']['demandes_ouvertes']['Row'];

/** Rayon d'écoute. 3 km à Dakar, c'est déjà vingt minutes aux heures de pointe. */
export const RAYON_M = 3000;

/**
 * Vitesse moyenne retenue pour estimer un délai d'arrivée, en km/h.
 *
 * Dakar aux heures ouvrables. C'est une ESTIMATION, affichée au conducteur avant
 * qu'il n'accepte, et modifiable dans la contre-offre : on ne promet pas un
 * délai au passager sans que le conducteur l'ait vu.
 */
const VITESSE_KMH = 18;

/** Distance à vol d'oiseau, en mètres. La route est plus longue d'environ 1,3. */
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Délai d'arrivée estimé, en minutes, jamais moins d'une. */
export function delaiEstimeMin(metres: number): number {
  const metresRoute = metres * 1.3;
  return Math.max(1, Math.round(metresRoute / 1000 / VITESSE_KMH * 60));
}

/** La capacité à conduire : documents validés ET véhicule actif. */
export function useEstConducteur() {
  const [etat, setEtat] = useState<'chargement' | 'oui' | 'non'>('chargement');

  const relire = useCallback(async (marqueur: { annule: boolean } | null) => {
    const { data: session } = await supabase.auth.getUser();
    const id = session.user?.id;
    if (!id) {
      if (!marqueur?.annule) setEtat('non');
      return;
    }
    const { data } = await supabase.rpc('est_conducteur', { p_profil: id });
    if (marqueur?.annule) return;
    setEtat(data === true ? 'oui' : 'non');
  }, []);

  useEffect(() => {
    const marqueur = { annule: false };
    // Faux positif : tout `setState` de `relire` suit un `await` réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);
    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(marqueur));
    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
    };
  }, [relire]);

  return etat;
}

/**
 * La file des demandes à portée.
 *
 * Relecture périodique plutôt que Realtime : `demandes_proches()` dépend de la
 * position du conducteur, qui bouge. Un flux sur `ride_requests` ne dirait pas
 * qu'une demande vient d'entrer dans le rayon parce que le conducteur a avancé.
 */
export function useDemandesProches(enLigne: boolean) {
  const [etat, setEtat] = useState<{
    statut: 'chargement' | 'pret' | 'erreur';
    demandes: DemandeProche[];
  }>({ statut: 'chargement', demandes: [] });

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      if (!enLigne) return;
      const { data, error } = await supabase.rpc('demandes_proches', {
        p_rayon_m: RAYON_M,
      });
      if (marqueur?.annule) return;
      setEtat(
        error || !data
          ? { statut: 'erreur', demandes: [] }
          : { statut: 'pret', demandes: data },
      );
    },
    [enLigne],
  );

  useEffect(() => {
    if (!enLigne) return undefined;
    const marqueur = { annule: false };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);
    const battement = setInterval(() => void relire(marqueur), 10000);

    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      clearInterval(battement);
      abonnement.remove();
    };
  }, [enLigne, relire]);

  return { ...etat, relire: () => void relire(null) };
}

/**
 * L'état « en ligne » vit en BASE, pas dans l'écran.
 *
 * Sinon un conducteur qui a fermé l'application se croit hors ligne au retour
 * alors qu'il reçoit toujours des demandes — ou l'inverse, ce qui est pire : il
 * attend des courses qui ne viendront pas.
 */
export function useEnLigne() {
  const [enLigne, setEnLigne] = useState<boolean | null>(null);

  const relire = useCallback(async (marqueur: { annule: boolean } | null) => {
    const { data: session } = await supabase.auth.getUser();
    const id = session.user?.id;
    if (!id) {
      if (!marqueur?.annule) setEnLigne(false);
      return;
    }
    const { data } = await supabase
      .from('positions_conducteurs')
      .select('en_ligne')
      .eq('conducteur_id', id)
      .maybeSingle();
    if (marqueur?.annule) return;
    setEnLigne(data?.en_ligne === true);
  }, []);

  useEffect(() => {
    const marqueur = { annule: false };
    // Faux positif : tout `setState` de `relire` suit un `await` réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);
    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(marqueur));
    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
    };
  }, [relire]);

  return { enLigne, setEnLigne, relire: () => void relire(null) };
}

/** Se mettre en ligne ou hors ligne, en publiant sa position. */
export async function majEnLigne(
  position: { latitude: number; longitude: number },
  enLigne: boolean,
) {
  return supabase.rpc('maj_position', {
    p_lat: position.latitude,
    p_lon: position.longitude,
    p_en_ligne: enLigne,
  });
}
