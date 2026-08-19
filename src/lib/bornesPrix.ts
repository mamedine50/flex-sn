import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Database } from './database.types';

/**
 * Les bornes de prix, lues en base.
 *
 * Aucune valeur en dur côté client. Les bornes vivent dans `bornes_prix`, c'est
 * la même table que lit `create_ride_request()` pour refuser un prix : une seule
 * source, donc pas de dérive entre la fourchette affichée et le refus du
 * serveur. Le jour où les prix réels de Dakar se révèlent, on ajuste une ligne
 * de table — pas une constante, pas une version de l'application.
 */
export type Service = Database['public']['Enums']['service_course'];

export type Bornes = { min: number; max: number };

export type EtatBornes =
  | { statut: 'chargement'; bornes: null; erreur: null }
  | { statut: 'pret'; bornes: Bornes; erreur: null }
  | { statut: 'erreur'; bornes: null; erreur: string };

/**
 * L'état porte le service qu'il décrit. Sans ça, changer de service laisserait
 * une fourchette urbaine affichée sous un titre interurbain le temps d'un
 * aller-retour — et c'est exactement l'instant où l'utilisateur lit le chiffre.
 */
type EtatInterne = EtatBornes & { service: Service | null };

export function useBornesPrix(service: Service): EtatBornes & { reessayer: () => void } {
  const [etat, setEtat] = useState<EtatInterne>({
    statut: 'chargement',
    bornes: null,
    erreur: null,
    service: null,
  });

  const charger = useCallback(
    async (vivant?: { annule: boolean }) => {
      const { data, error } = await supabase
        .from('bornes_prix')
        .select('min_xof, max_xof')
        .eq('service', service)
        .single();

      if (vivant?.annule) return;

      if (error || !data) {
        // Aucun repli sur des valeurs inventées : afficher une fourchette fausse
        // ferait proposer un prix que le serveur refusera ensuite.
        setEtat({
          statut: 'erreur',
          bornes: null,
          erreur: error?.message ?? 'bornes_absentes',
          service,
        });
        return;
      }

      setEtat({
        statut: 'pret',
        bornes: { min: data.min_xof, max: data.max_xof },
        erreur: null,
        service,
      });
    },
    [service],
  );

  useEffect(() => {
    const vivant = { annule: false };
    // Faux positif : `charger` attend la réponse réseau avant tout `setState`.
    // La règle ne voit pas à travers l'`await` et croit l'appel synchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger(vivant);
    return () => {
      vivant.annule = true;
    };
  }, [charger]);

  const reessayer = useCallback(() => {
    setEtat({ statut: 'chargement', bornes: null, erreur: null, service: null });
    void charger();
  }, [charger]);

  // Tant que l'état décrit un autre service, il est périmé : on rend
  // « chargement » plutôt qu'une fourchette qui n'est pas la bonne.
  if (etat.service !== service) {
    return { statut: 'chargement', bornes: null, erreur: null, reessayer };
  }

  const { service: _, ...expose } = etat;
  return { ...expose, reessayer };
}
