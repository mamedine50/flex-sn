import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Mon propre profil, en entier.
 *
 * On interroge la TABLE, pas `profils_publics` : c'est le seul endroit où l'on
 * a le droit de voir son nom complet et son numéro, et la policy
 * `profiles_soi_meme` s'en charge. Passer par la vue publique reviendrait à se
 * cacher ses propres données.
 */
export type MonProfil = Database['public']['Tables']['profiles']['Row'];

export function useMonProfil() {
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id;
      if (!uid) return;

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (vivant.annule) return;

      // Une lecture qui échoue n'est pas un profil vide : sans la distinction,
      // l'écran proposerait de remplir des champs déjà remplis.
      if (error) {
        setStatut('erreur');
        return;
      }
      setProfil(data ?? null);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  const relire = useCallback(() => setTour((n) => n + 1), []);

  /**
   * On relit au RETOUR sur l'écran.
   *
   * Défaut trouvé sur l'appareil : une photo déposée depuis « Mon profil »
   * n'apparaissait pas sur l'onglet Profil. L'onglet était monté avant, sa
   * lecture datait d'avant le dépôt, et rien ne lui disait que la donnée avait
   * bougé. Même règle que pour les courses — on relit au retour au premier
   * plan, on ne fait pas confiance à un état accumulé.
   *
   * Le premier passage est ignoré : l'effet de montage vient déjà de lire.
   */
  const premiereMise = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (premiereMise.current) {
        premiereMise.current = false;
        return;
      }
      setTour((n) => n + 1);
    }, []),
  );

  return { profil, statut, relire };
}

export async function majProfil(prenom: string, nomComplet: string) {
  return supabase.rpc('maj_profil', {
    p_prenom: prenom.trim(),
    // Chaîne vide = « ne touche pas » côté base (`nullif` puis `coalesce`). On
    // n'efface donc pas un nom en vidant le champ — et c'est assumé : effacer
    // son nom complet n'est pas une demande qu'on a rencontrée.
    p_nom_complet: nomComplet.trim(),
  });
}
