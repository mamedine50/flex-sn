import { useCallback, useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Le blocage entre personnes.
 *
 * Ce que le client fait ici est cosmétique : la règle vit en base — les vues
 * d'appariement filtrent, et deux déclencheurs refusent l'offre et la course.
 * Un blocage qui ne ferait que cacher l'interface serait du théâtre.
 *
 * `mes_blocages` ne rend que les blocages qu'on a POSÉS. On n'apprend jamais
 * qu'on a été bloqué : le savoir ne sert qu'à se venger.
 */
export type Blocage = Database['public']['Views']['mes_blocages']['Row'];

export function useBlocages() {
  const [blocages, setBlocages] = useState<Blocage[]>([]);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data, error } = await supabase
        .from('mes_blocages')
        .select('*')
        .order('cree_le', { ascending: false });
      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      setBlocages(data ?? []);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  return { blocages, statut, relire: useCallback(() => setTour((n) => n + 1), []) };
}

export async function bloquer(profil: string, motif?: string | null) {
  return supabase.rpc('bloquer', { p_profil: profil, p_motif: motif ?? undefined });
}

export async function debloquer(profil: string) {
  return supabase.rpc('debloquer', { p_profil: profil });
}
