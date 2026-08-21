import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { lire, ecrire, effacer } from './stockage';
import { supabase } from './supabase';

/**
 * Deux mondes, une bascule.
 *
 * Le passager par défaut. Le conducteur seulement pour qui en a la capacité, et
 * seulement APRÈS un geste : on n'ouvre jamais l'application directement en
 * ligne. Quelqu'un qui a fini sa journée hier et rouvre le matin ne doit pas se
 * retrouver à l'écoute sans l'avoir demandé.
 *
 * D'où la règle de survie, qui n'est pas la même dans les deux sens :
 *
 *   - un aller-retour au premier plan GARDE le monde — répondre à un appel ne
 *     doit pas faire perdre sa place ;
 *   - un démarrage À FROID revient au monde passager.
 *
 * La marque est donc écrite avec l'instant, et relue avec une péremption. Sans
 * horodatage, on ne distingue pas les deux cas : le stockage survit aux deux.
 *
 * ET LE MONDE MEURT AVEC LA SESSION. Une déconnexion l'efface, en mémoire comme
 * au stockage. Sans ça, deux défauts : le compte SUIVANT sur ce téléphone
 * démarrerait dans le monde conducteur d'un autre, et celui qui se reconnecte
 * lui-même se retrouverait au volant sans l'avoir demandé — alors que la règle
 * est de ne jamais ouvrir en ligne sans un geste.
 */
const CLE = 'flex.monde';

/** Au-delà, on considère que l'application a été fermée, pas mise de côté. */
const PEREMPTION_MS = 5 * 60 * 1000;

export type Monde = 'passager' | 'conducteur';

export function useMonde() {
  const [monde, setMonde] = useState<Monde>('passager');
  const [pret, setPret] = useState(false);

  useEffect(() => {
    void (async () => {
      const brut = await lire(CLE);
      const [valeur, instant] = (brut ?? '').split('|');
      const frais = Number(instant) > Date.now() - PEREMPTION_MS;
      if (valeur === 'conducteur' && frais) setMonde('conducteur');
      setPret(true);
    })();
  }, []);

  // On repousse la péremption à chaque retour au premier plan : c'est ce qui
  // fait qu'une pause de deux minutes ne coûte pas sa session.
  useEffect(() => {
    const abonnement = AppState.addEventListener('change', (etat) => {
      if (etat !== 'active') return;
      setMonde((actuel) => {
        if (actuel === 'conducteur') void ecrire(CLE, `conducteur|${Date.now()}`);
        return actuel;
      });
    });
    return () => abonnement.remove();
  }, []);

  useEffect(() => {
    const { data: veille } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement !== 'SIGNED_OUT') return;
      setMonde('passager');
      void effacer(CLE);
    });
    return () => veille.subscription.unsubscribe();
  }, []);

  const basculer = useCallback((suivant: Monde) => {
    setMonde(suivant);
    void ecrire(CLE, `${suivant}|${Date.now()}`);
  }, []);

  return { monde, pret, basculer };
}
