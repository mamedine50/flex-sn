import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ZONE_TEST } from './couverture';
import type { Database } from './database.types';
import { supabase } from './supabase';

export { delaiEstimeMin, distanceM } from './geo';

/**
 * Le côté conducteur : capacité, mise en ligne, file des demandes proches.
 */
export type DemandeProche = Database['public']['Views']['demandes_ouvertes']['Row'];

/**
 * Le rayon d'écoute du conducteur — la distance au-delà de laquelle une demande
 * ne lui est plus proposée.
 *
 * 3 KM À DAKAR, et ce n'est pas peu : aux heures de pointe c'est déjà vingt
 * minutes de trajet pour aller chercher quelqu'un. Un rayon plus large remplit
 * la file de courses qu'on refusera, et fait attendre le passager pendant qu'un
 * conducteur trop loin réfléchit.
 *
 * EN MODE TEST, IL PASSE À 60 KM. Deux téléphones qui s'essaient depuis
 * Gatineau ne sont pas à trois kilomètres l'un de l'autre, et une file vide ne
 * prouve rien du tout — on croirait l'appariement cassé alors qu'il travaille.
 * C'est le même interrupteur que la zone : un seul point de vérité pour tout ce
 * qui relâche la géographie pendant les essais.
 *
 * Le rayon est envoyé par le client à `demandes_proches()`. Il ne cache rien :
 * le filtrage se fait sur la MAILLE, jamais sur le point exact, et un rayon
 * choisi par l'appelant sur un point exact se trilatérerait en trois essais.
 * C'est pourquoi on peut le laisser réglable sans y regarder à deux fois.
 */
export const RAYON_M = ZONE_TEST ? 60_000 : 3_000;

/**
 * La capacité à conduire : documents validés ET véhicule actif.
 *
 * Elle se relit au RETOUR AU PREMIER PLAN, et pas seulement au montage. Un
 * dossier se valide pendant que le candidat attend, application ouverte : sans
 * cette relecture, le raccourci « Passer en ligne » et les sections conducteur
 * n'apparaîtraient qu'au prochain démarrage — et personne ne redémarre une
 * application pour vérifier si son dossier est passé. Il conclurait qu'on l'a
 * refusé sans le lui dire.
 */
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
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(marqueur);
    });
    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
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

/** Une liste vide stable : une nouvelle à chaque rendu relancerait les enfants. */
const VIDE: Negociation[] = [];

/** Une contre-proposition que le passager a renvoyée au conducteur. */
export type Negociation =
  Database['public']['Views']['negociations_conducteur']['Row'];

/**
 * Les contre-propositions reçues.
 *
 * SANS ELLES, LA MOITIÉ DE LA NÉGOCIATION EST BORGNE. La file du conducteur ne
 * montre que les demandes OUVERTES ; un fil où le passager vient de répondre
 * n'y ressort pas. Le conducteur croirait que sa contre-offre est restée sans
 * réponse, et le passager attendrait une réponse qui ne vient pas.
 *
 * Même cadence que la file, et pour la même raison : le canal se ferme en
 * arrière-plan et les réponses de l'intervalle ne sont jamais rejouées.
 */
export function useNegociations(enLigne: boolean) {
  const [negociations, setNegociations] = useState<Negociation[]>([]);

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      if (!enLigne) return;
      const { data } = await supabase.from('negociations_conducteur').select('*');
      if (marqueur?.annule) return;
      setNegociations(data ?? []);
    },
    [enLigne],
  );

  // Hors ligne, la liste se vide — mais depuis le RENDU, pas depuis l'effet :
  // un `setState` synchrone dans un effet déclenche une cascade de rendus.
  const visibles = enLigne ? negociations : VIDE;

  useEffect(() => {
    if (!enLigne) return undefined;
    const marqueur = { annule: false };
    // Faux positif : `relire` attend la réponse réseau avant tout `setState`.
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

  return { negociations: visibles, relire: () => void relire(null) };
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
/**
 * Se déclarer hors ligne sans position connue.
 *
 * `maj_position()` porte la position ET l'état : il faut donc des coordonnées
 * pour changer l'état. Plutôt que d'en inventer — un centre de Dakar écrit dans
 * la base est un mensonge stocké, et il servirait la file si `en_ligne`
 * repassait à vrai — on relit la DERNIÈRE position connue. C'est la seule
 * valeur qui reste vraie.
 */
export async function quitterLaLigne() {
  const { data: session } = await supabase.auth.getUser();
  const id = session.user?.id;
  if (!id) return { error: null };

  const { data } = await supabase
    .from('positions_conducteurs')
    .select('lat, lon')
    .eq('conducteur_id', id)
    .maybeSingle();

  if (!data) return { error: null };

  return majEnLigne({ latitude: data.lat, longitude: data.lon }, false);
}

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
