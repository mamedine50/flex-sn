import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * La course en cours, pour les deux rôles.
 *
 * Realtime déclenche une relecture, il ne fait pas foi — même règle que les
 * offres. On relit aussi au retour au premier plan et à l'ouverture de session :
 * une course dure vingt minutes, l'application passe en arrière-plan pendant, et
 * les changements de l'intervalle ne sont jamais rejoués.
 */
export type StatutCourse = Database['public']['Enums']['statut_course'];

/** L'ordre du cycle. Le conducteur avance d'un cran, jamais deux. */
export const ETAPE_SUIVANTE: Partial<Record<StatutCourse, StatutCourse>> = {
  verrouillee: 'en_route',
  en_route: 'arrive',
  arrive: 'commencee',
  commencee: 'terminee',
};

export const COURSE_ACTIVE: StatutCourse[] = [
  'verrouillee',
  'en_route',
  'arrive',
  'commencee',
  'en_cours',
];

type Profil = {
  id: string;
  prenom: string;
  nom_complet: string | null;
  telephone: string | null;
  photo_url: string | null;
  note_moyenne: number | null;
};

export type Course = Database['public']['Tables']['rides']['Row'] & {
  demande: Database['public']['Tables']['ride_requests']['Row'] | null;
  vehicule: Database['public']['Tables']['vehicles']['Row'] | null;
  passager: Profil | null;
  conducteur: Profil | null;
};

/**
 * On interroge les TABLES, pas une vue : leurs policies portent déjà exactement
 * la bonne confidentialité — nom complet, numéro et plaque n'apparaissent que
 * sur une course active de l'appelant. Une vue en `security definer` demanderait
 * de réécrire cette règle une seconde fois, et c'est la seconde qui fuirait.
 */
const SELECTION = `*,
  demande:ride_requests!rides_demande_id_fkey(*),
  vehicule:vehicles!rides_vehicule_id_fkey(*),
  passager:profiles!rides_passager_id_fkey(id, prenom, nom_complet, telephone, photo_url, note_moyenne),
  conducteur:profiles!rides_conducteur_id_fkey(id, prenom, nom_complet, telephone, photo_url, note_moyenne)`;

export type EtatCourse = {
  statut: 'chargement' | 'pret' | 'erreur';
  course: Course | null;
  /** Vrai pendant une resynchronisation, pour la distinguer d'un chargement. */
  resynchronise: boolean;
};

/**
 * Un canal Realtime est identifié par son NOM. Deux `useCourse()` montés en même
 * temps — l'accueil qui propose de reprendre, et l'écran En route — demandaient
 * le même nom, et le second `.on()` arrivait après le `.subscribe()` du premier :
 * l'application plantait au montage. Chaque instance porte donc son propre
 * numéro.
 */
let compteurCanal = 0;

export function useCourse(courseId?: string | null) {
  const [numeroCanal] = useState(() => {
    compteurCanal += 1;
    return compteurCanal;
  });
  const [etat, setEtat] = useState<EtatCourse>({
    statut: 'chargement',
    course: null,
    resynchronise: false,
  });

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      let requete = supabase.from('rides').select(SELECTION);

      requete = courseId
        ? requete.eq('id', courseId)
        : /*
           * Sans identifiant : la course « en cours » de l'appelant — au sens
           * où elle le CONCERNE encore.
           *
           * `terminee` en fait partie, et c'est un défaut corrigé : la liste
           * s'arrêtait aux statuts actifs, donc à la seconde où le conducteur
           * appuyait sur « Terminer », la relecture ne rendait plus rien et
           * l'écran de notation disparaissait avant d'avoir été vu. La note
           * était obligatoire et inatteignable.
           *
           * Une course reste la vôtre tant que vous ne l'avez pas notée. C'est
           * `relire()` qui écarte ensuite celles qu'on a déjà notées.
           */
          requete.in('statut', [...COURSE_ACTIVE, 'terminee']);

      const { data, error } = await requete
        .order('verrouillee_le', { ascending: false })
        .limit(1);

      if (marqueur?.annule) return;

      /*
       * Une course terminée ET DÉJÀ NOTÉE ne concerne plus personne : on la
       * retire, sinon l'écran de notation resterait affiché pour toujours et le
       * conducteur ne pourrait plus rien accepter.
       */
      const trouvee = (data?.[0] as Course | undefined) ?? null;
      let course = trouvee;
      if (trouvee && trouvee.statut === 'terminee') {
        const { data: session } = await supabase.auth.getUser();
        const uid = session.user?.id;
        const { count } = await supabase
          .from('evaluations')
          .select('course_id', { count: 'exact', head: true })
          .eq('course_id', trouvee.id)
          .eq('auteur_id', uid ?? '');
        if (marqueur?.annule) return;
        if ((count ?? 0) > 0) course = null;
      }

      setEtat({
        statut: error ? 'erreur' : 'pret',
        course,
        resynchronise: false,
      });
    },
    [courseId],
  );

  useEffect(() => {
    const marqueur = { annule: false };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);

    const canal = supabase
      .channel(`course:${courseId ?? 'active'}:${numeroCanal}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides' },
        () => void relire(marqueur),
      )
      .subscribe();

    const { data: veille } = supabase.auth.onAuthStateChange(() =>
      void relire(marqueur),
    );

    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp !== 'active') return;
      setEtat((e) => ({ ...e, resynchronise: true }));
      void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
      void supabase.removeChannel(canal);
    };
  }, [courseId, numeroCanal, relire]);

  return { ...etat, relire: () => void relire(null) };
}

export async function avancerCourse(courseId: string, statut: StatutCourse) {
  return supabase.rpc('avancer_course', { p_course_id: courseId, p_statut: statut });
}

export async function annulerCourse(courseId: string, motif?: string) {
  return supabase.rpc('annuler_course', {
    p_course_id: courseId,
    p_motif: motif ?? undefined,
  });
}

export async function noterCourse(courseId: string, note: number, commentaire?: string) {
  return supabase.rpc('noter_course', {
    p_course_id: courseId,
    p_note: note,
    p_commentaire: commentaire ?? undefined,
  });
}

/**
 * La position du conducteur, telle qu'il l'a publiée.
 *
 * Sert au passager pendant la course. Ce qui compte n'est pas tant la position
 * que sa FRAÎCHEUR : une voiture qui n'a pas bougé depuis cinq minutes est soit
 * bloquée dans un embouteillage, soit en train de faire autre chose, et le
 * passager mérite de le savoir avant de s'inquiéter tout seul.
 */
export function usePositionConducteur(conducteurId: string | null, actif: boolean) {
  const [position, setPosition] = useState<{
    latitude: number;
    longitude: number;
    cap: number | null;
    majLe: string;
  } | null>(null);

  useEffect(() => {
    if (!conducteurId || !actif) return undefined;
    const marqueur = { annule: false };

    const relire = async () => {
      const { data } = await supabase
        .from('positions_conducteurs')
        .select('lat, lon, cap, maj_le')
        .eq('conducteur_id', conducteurId)
        .maybeSingle();
      if (marqueur.annule || !data) return;
      setPosition({
        latitude: data.lat,
        longitude: data.lon,
        cap: data.cap,
        majLe: data.maj_le,
      });
    };

    void relire();
    const battement = setInterval(() => void relire(), 15000);

    return () => {
      marqueur.annule = true;
      clearInterval(battement);
    };
  }, [conducteurId, actif]);

  return position;
}

/** A-t-on déjà noté cette course ? On voit toujours sa propre évaluation. */
export function useDejaNote(courseId: string | null) {
  const [deja, setDeja] = useState<boolean | null>(null);

  useEffect(() => {
    if (!courseId) return undefined;
    const marqueur = { annule: false };

    void (async () => {
      const { data } = await supabase
        .from('evaluations')
        .select('note')
        .eq('course_id', courseId)
        .maybeSingle();
      if (!marqueur.annule) setDeja(data !== null);
    })();

    return () => {
      marqueur.annule = true;
    };
  }, [courseId]);

  return deja;
}
