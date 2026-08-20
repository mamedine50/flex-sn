import { useCallback, useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Les lieux favoris.
 *
 * Toute la valeur est dans le raccourci : ils apparaissent EN PREMIER dans le
 * choix de départ et de destination, avant la recherche. Une liste de favoris
 * qu'il faut aller chercher dans un réglage ne sert à rien.
 */
export type Favori = Database['public']['Tables']['lieux_favoris']['Row'];
export type TypeFavori = Database['public']['Enums']['type_lieu_favori'];

/** L'ordre d'affichage : ce qu'on utilise le plus, en premier. */
const RANG: Record<TypeFavori, number> = { domicile: 0, travail: 1, autre: 2 };

export function useFavoris() {
  const [favoris, setFavoris] = useState<Favori[]>([]);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data, error } = await supabase.from('lieux_favoris').select('*');
      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      const tries = [...(data ?? [])].sort(
        (a, b) => RANG[a.type] - RANG[b.type] || a.cree_le.localeCompare(b.cree_le),
      );
      setFavoris(tries);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  const relire = useCallback(() => setTour((n) => n + 1), []);
  return { favoris, statut, relire };
}

export async function enregistrerFavori(entree: {
  type: TypeFavori;
  lat: number;
  lon: number;
  libelle?: string | null;
  precision?: string | null;
  id?: string | null;
}) {
  return supabase.rpc('enregistrer_lieu_favori', {
    p_type: entree.type,
    p_lat: entree.lat,
    p_lon: entree.lon,
    p_libelle: entree.libelle ?? undefined,
    p_precision: entree.precision ?? undefined,
    p_id: entree.id ?? undefined,
  });
}

export async function supprimerFavori(id: string) {
  return supabase.rpc('supprimer_lieu_favori', { p_id: id });
}
