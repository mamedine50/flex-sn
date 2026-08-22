import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * L'administration des dossiers conducteur.
 *
 * Tout est filtré CÔTÉ BASE : `dossiers_en_attente` porte son `est_admin()`
 * dans sa définition, `dossier_du_candidat()` aussi. Le client ne décide de
 * rien — il ne fait qu'afficher ce qu'on lui sert, et n'obtient rien s'il n'y a
 * pas droit.
 */
export type DossierEnAttente = Database['public']['Views']['dossiers_en_attente']['Row'];
export type Piece = Database['public']['Tables']['documents_conducteur']['Row'];
export type TypeDocument = Database['public']['Enums']['type_document'];

/**
 * Le drapeau, lu à la source. Jamais déduit d'autre chose.
 *
 * Relu au changement de session ET au retour au premier plan. Sans le premier,
 * une déconnexion suivie d'une connexion sous un AUTRE compte laisserait le
 * drapeau du précédent : la section Administration resterait affichée à
 * quelqu'un qui n'y a pas droit. Elle ne servirait rien — le filtre est en base
 * — mais montrer une porte qu'on ne peut pas ouvrir est déjà une erreur.
 */
export function useEstAdmin() {
  const [etat, setEtat] = useState<'chargement' | 'oui' | 'non'>('chargement');

  const relire = useCallback(async (vivant: { annule: boolean }) => {
    const { data, error } = await supabase.rpc('est_admin');
    if (vivant.annule) return;
    setEtat(!error && data === true ? 'oui' : 'non');
  }, []);

  useEffect(() => {
    const vivant = { annule: false };
    // Faux positif : tout `setState` de `relire` suit un `await` réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(vivant);
    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(vivant));
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(vivant);
    });
    return () => {
      vivant.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
    };
  }, [relire]);

  return etat;
}

/** Le candidat vu par l'administration : identité, véhicule, capacité. */
export type Candidat = Database['public']['Views']['candidat_admin']['Row'];

/**
 * L'identité du candidat, LUE À PART.
 *
 * Elle venait de la file d'attente — laquelle se vide par construction dès que
 * toutes les pièces sont décidées. L'écran perdait alors le nom (« 's file »),
 * la photo, et annonçait « aucun véhicule » alors qu'il y en avait un. Une page
 * de détail ne dépend pas d'une liste dont l'objet est de se vider.
 */
export function useCandidat(profil: string | undefined) {
  const [candidat, setCandidat] = useState<Candidat | null>(null);

  useEffect(() => {
    if (!profil) return undefined;
    const vivant = { annule: false };
    void (async () => {
      const { data } = await supabase
        .from('candidat_admin')
        .select('*')
        .eq('profil_id', profil)
        .maybeSingle();
      if (!vivant.annule) setCandidat(data ?? null);
    })();
    return () => {
      vivant.annule = true;
    };
  }, [profil]);

  return candidat;
}

export function useFileDossiers() {
  const [dossiers, setDossiers] = useState<DossierEnAttente[]>([]);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [tour, setTour] = useState(0);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      // Du plus ancien au plus récent : c'est celui qui attend depuis le plus
      // longtemps qu'il faut traiter, pas le dernier arrivé.
      const { data, error } = await supabase
        .from('dossiers_en_attente')
        .select('*')
        .order('depuis', { ascending: true });
      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      setDossiers(data ?? []);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  return { dossiers, statut, relire: useCallback(() => setTour((n) => n + 1), []) };
}

export function useDossier(profilId?: string | null) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [tour, setTour] = useState(0);

  useEffect(() => {
    if (!profilId) return;
    const vivant = { annule: false };
    void (async () => {
      const { data, error } = await supabase.rpc('dossier_du_candidat', {
        p_profil: profilId,
      });
      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      setPieces((data ?? []) as Piece[]);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [profilId, tour]);

  return { pieces, statut, relire: useCallback(() => setTour((n) => n + 1), []) };
}

export async function deciderPiece(
  profil: string,
  type: TypeDocument,
  valide: boolean,
  motif?: string | null,
) {
  return supabase.rpc('decider_document', {
    p_profil: profil,
    p_type: type,
    p_valide: valide,
    p_motif: motif ?? undefined,
  });
}

/**
 * L'URL signée d'une pièce.
 *
 * Le dépôt `documents-conducteur` est privé ; une policy sert ces objets à leur
 * propriétaire ET à un admin. La signature échoue donc d'elle-même pour qui n'a
 * pas le droit — on n'a pas à le vérifier ici une seconde fois.
 */
export async function urlPiece(chemin: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from('documents-conducteur')
    .createSignedUrl(chemin, 600);
  return data?.signedUrl ?? null;
}

export { attenteDepuis } from './attente';
