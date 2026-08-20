import { useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Les gains du conducteur.
 *
 * La vue `mes_gains` filtre sur `auth.uid()` elle-même : rien à passer, rien à
 * oublier. Aucune ligne signifie aucune course terminée — c'est zéro, pas une
 * erreur, et l'écran doit le dire.
 */
export type Gains = Database['public']['Views']['mes_gains']['Row'];

export const GAINS_VIDES = { courses: 0, total_xof: 0, semaine_xof: 0 };

export function useGains(actif: boolean) {
  const [gains, setGains] = useState<typeof GAINS_VIDES | null>(null);

  useEffect(() => {
    if (!actif) return;

    const vivant = { annule: false };
    void (async () => {
      const { data, error } = await supabase
        .from('mes_gains')
        .select('courses, total_xof, semaine_xof')
        .maybeSingle();
      if (vivant.annule || error) return;
      setGains({
        courses: data?.courses ?? 0,
        total_xof: Number(data?.total_xof ?? 0),
        semaine_xof: Number(data?.semaine_xof ?? 0),
      });
    })();

    return () => {
      vivant.annule = true;
    };
  }, [actif]);

  return gains;
}
