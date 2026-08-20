import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Les offres reçues, en temps réel.
 *
 * **Realtime déclenche, il ne fait pas foi.** Chaque événement provoque une
 * relecture de `offres_recues` plutôt qu'une mise à jour locale à partir de la
 * charge utile. C'est plus de requêtes, et c'est le bon compromis :
 *
 *   - le canal se ferme quand l'application passe en arrière-plan, et les offres
 *     arrivées entre-temps ne sont jamais rejouées ;
 *   - une charge utile Realtime porte la ligne d'`offers`, pas le prénom du
 *     conducteur ni son véhicule — il faudrait de toute façon aller les chercher ;
 *   - un état reconstruit par accumulation d'événements diverge du serveur dès
 *     qu'un seul événement manque, et rien ne le signale.
 *
 * D'où la resynchronisation au retour au premier plan : c'est le moment exact où
 * l'utilisateur regarde, et celui où le flux a le plus de chances d'avoir un trou.
 */
export type Offre = Database['public']['Views']['offres_recues']['Row'];

export type EtatOffres = {
  statut: 'chargement' | 'pret' | 'erreur';
  offres: Offre[];
  /** Vrai pendant une resynchronisation, pour distinguer d'un premier chargement. */
  resynchronise: boolean;
};

let compteurCanal = 0;

export function useOffres(demandeId: string | null) {
  const [numeroCanal] = useState(() => {
    compteurCanal += 1;
    return compteurCanal;
  });
  const [etat, setEtat] = useState<EtatOffres>({
    statut: 'chargement',
    offres: [],
    resynchronise: false,
  });

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      if (!demandeId) return;

      const { data, error } = await supabase
        .from('offres_recues')
        .select('*')
        .eq('demande_id', demandeId)
        .order('cree_le', { ascending: false });

      if (marqueur?.annule) return;

      setEtat(
        error || !data
          ? { statut: 'erreur', offres: [], resynchronise: false }
          : { statut: 'pret', offres: data, resynchronise: false },
      );
    },
    [demandeId],
  );

  useEffect(() => {
    if (!demandeId) return undefined;
    const marqueur = { annule: false };

    // Faux positif : tout `setState` de `relire` suit un `await` réseau. La
    // règle ne voit pas à travers l'`await` et croit l'appel synchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);

    const canal = supabase
      // Même règle que pour la course : le nom d'un canal est unique par
      // instance, sinon un second montage ajoute un `.on()` après le
      // `.subscribe()` du premier et l'application plante.
      .channel(`offres:${demandeId}:${numeroCanal}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offers',
          filter: `demande_id=eq.${demandeId}`,
        },
        () => void relire(marqueur),
      )
      .subscribe();

    // Une session qui s'ouvre change ce que la RLS laisse voir : sans cette
    // relecture, un écran monté avant la connexion resterait vide pour toujours.
    const { data: veille } = supabase.auth.onAuthStateChange(() => {
      void relire(marqueur);
    });

    // Retour au premier plan : on relit, sans attendre que le canal se rétablisse.
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp !== 'active') return;
      // Le drapeau se pose ici, dans le gestionnaire, pas dans `relire` : c'est
      // la resynchronisation qui est visible, pas la relecture ordinaire.
      setEtat((e) => ({ ...e, resynchronise: true }));
      void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
      void supabase.removeChannel(canal);
    };
  }, [demandeId, numeroCanal, relire]);

  return { ...etat, relire: () => void relire(null) };
}

/** La demande en cours du passager, s'il en a une. */
export type Demande = Database['public']['Tables']['ride_requests']['Row'];

/**
 * Retirer une demande encore ouverte.
 *
 * Après verrouillage c'est `annuler_course()` qui s'applique : la distinction
 * n'est pas cosmétique, une course a un conducteur en route.
 */
export async function annulerDemande(demandeId: string) {
  return supabase.rpc('annuler_demande', { p_demande_id: demandeId });
}

export function useDemandeEnCours() {
  const [etat, setEtat] = useState<{
    statut: 'chargement' | 'pret' | 'erreur';
    demande: Demande | null;
  }>({ statut: 'chargement', demande: null });

  const relire = useCallback(async (marqueur: { annule: boolean } | null) => {
    const { data, error } = await supabase
      .from('ride_requests')
      .select('*')
      .in('statut', ['ouverte', 'verrouillee'])
      .order('cree_le', { ascending: false })
      .limit(1);

    if (marqueur?.annule) return;
    setEtat(
      error
        ? { statut: 'erreur', demande: null }
        : { statut: 'pret', demande: data?.[0] ?? null },
    );
  }, []);

  useEffect(() => {
    const marqueur = { annule: false };
    // Même faux positif que ci-dessus.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);

    const { data: veille } = supabase.auth.onAuthStateChange(() => {
      void relire(marqueur);
    });

    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
    };
  }, [relire]);

  return { ...etat, relire: () => void relire(null) };
}
