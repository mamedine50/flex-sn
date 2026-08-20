import { useEffect, useState } from 'react';

import type { Database } from './database.types';
import { cleErreur } from './erreursServeur';
import { supabase } from './supabase';

/**
 * Le véhicule actif du conducteur.
 *
 * Sans lui, un dossier complet n'ouvre rien : `est_conducteur()` demande les
 * documents validés ET un véhicule actif. C'est la moitié du formulaire qui
 * manquait.
 */
export type Vehicule = Database['public']['Tables']['vehicles']['Row'];

export type ResultatVehicule =
  | { ok: true; vehicule: Vehicule }
  | { ok: false; cle: string };

export async function declarerVehicule(
  plaque: string,
  modele: string,
  couleur: string,
): Promise<ResultatVehicule> {
  const { data, error } = await supabase.rpc('declarer_vehicule', {
    p_plaque: plaque,
    p_modele: modele,
    p_couleur: couleur,
  });

  if (error || !data) return { ok: false, cle: cleErreur(error) };
  return { ok: true, vehicule: data as Vehicule };
}

export function useVehicule() {
  const [vehicule, setVehicule] = useState<Vehicule | null>(null);
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id;
      if (!uid) return;

      // Le filtre sur `conducteur_id` n'est PAS redondant avec la RLS : la
      // policy `vehicles_course_active` sert aussi le véhicule de la course en
      // cours. Sans lui, l'écran a montré la voiture d'un autre conducteur
      // comme « votre véhicule ». Vu à l'écran, pas dans le code.
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .eq('conducteur_id', uid)
        .eq('actif', true)
        .limit(1)
        .maybeSingle();
      if (vivant.annule) return;
      setVehicule(data ?? null);
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  return { vehicule, relire: () => setTour((n) => n + 1) };
}
