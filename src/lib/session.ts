import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * La session courante. Un seul abonnement, alimenté par le client unique.
 */
export type EtatSession =
  | { statut: 'chargement'; session: null }
  | { statut: 'connecte'; session: Session }
  | { statut: 'anonyme'; session: null };

export function useSession(): EtatSession {
  const [etat, setEtat] = useState<EtatSession>({ statut: 'chargement', session: null });

  useEffect(() => {
    let vivant = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!vivant) return;
      setEtat(
        data.session
          ? { statut: 'connecte', session: data.session }
          : { statut: 'anonyme', session: null },
      );
    });

    const { data: abonnement } = supabase.auth.onAuthStateChange((_evenement, session) => {
      setEtat(
        session ? { statut: 'connecte', session } : { statut: 'anonyme', session: null },
      );
    });

    return () => {
      vivant = false;
      abonnement.subscription.unsubscribe();
    };
  }, []);

  return etat;
}
