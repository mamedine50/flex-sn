import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Le fil d'une course, en temps réel.
 *
 * ── POURQUOI IL EXISTE ─────────────────────────────────────────────────────
 * « Écrire » ouvrait l'application SMS du téléphone, et les deux numéros
 * partaient avec. DÉFINITIVEMENT : la course finit, la RLS se referme, mais le
 * numéro est déjà dans le répertoire d'en face. Aucune règle serveur ne
 * rattrape ça. Le fil interne ferme cette porte.
 *
 * ── REALTIME DÉCLENCHE, IL NE FAIT PAS FOI ─────────────────────────────────
 * Chaque événement provoque une RELECTURE du fil, jamais un ajout local à
 * partir de la charge utile. Même raison qu'ailleurs dans le produit : le canal
 * se ferme quand l'application passe en arrière-plan et les messages de
 * l'intervalle ne sont jamais rejoués, et un fil reconstruit par accumulation
 * diverge du serveur dès qu'un seul événement manque — sans que rien ne le
 * signale. Un message perdu dans une messagerie, c'est la messagerie qui ne
 * sert plus à rien.
 *
 * On relit donc aussi au retour au premier plan : c'est le moment exact où
 * quelqu'un regarde, et celui où le flux a le plus de chances d'avoir un trou.
 */
export type Message = Database['public']['Tables']['messages']['Row'];

export type EtatFil = {
  statut: 'chargement' | 'pret' | 'erreur';
  messages: Message[];
};

/** Un canal porte un nom unique par montage : deux `.on()` après un `.subscribe()` font planter. */
let compteurCanal = 0;

export function useFil(courseId: string | null) {
  const [numeroCanal] = useState(() => {
    compteurCanal += 1;
    return compteurCanal;
  });
  const [etat, setEtat] = useState<EtatFil>({ statut: 'chargement', messages: [] });

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      if (!courseId) return;

      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('course_id', courseId)
        .order('cree_le', { ascending: true });

      if (marqueur?.annule) return;

      setEtat(
        error || !data
          ? { statut: 'erreur', messages: [] }
          : { statut: 'pret', messages: data },
      );
    },
    [courseId],
  );

  useEffect(() => {
    if (!courseId) return undefined;
    const marqueur = { annule: false };

    // Faux positif : tout `setState` de `relire` suit un `await` réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);

    const canal = supabase
      .channel(`fil:${courseId}:${numeroCanal}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `course_id=eq.${courseId}`,
        },
        () => void relire(marqueur),
      )
      .subscribe();

    // Une session qui s'ouvre change ce que la RLS laisse voir.
    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(marqueur));

    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
      // Le désabonnement à la fin de la course se fait ICI, par démontage :
      // l'écran de course disparaît quand la course se termine, et le canal
      // avec lui. Pas de canal qui survit à son fil.
      void supabase.removeChannel(canal);
    };
  }, [courseId, numeroCanal, relire]);

  return { ...etat, relire: () => void relire(null) };
}

export type ResultatEnvoi = { ok: true } | { ok: false; cle: 'ferme' | 'reseau' };

/**
 * Envoyer. Le serveur refuse un fil fermé et un tiers ; l'écran distingue les
 * deux refus parce qu'ils ne demandent pas la même chose à celui qui lit.
 */
export async function envoyer(courseId: string, contenu: string): Promise<ResultatEnvoi> {
  const texte = contenu.trim();
  if (!texte) return { ok: false, cle: 'reseau' };

  const { error } = await supabase.rpc('envoyer_message', {
    p_course_id: courseId,
    p_contenu: texte,
  });

  if (!error) return { ok: true };
  return { ok: false, cle: error.message.includes('fil_ferme') ? 'ferme' : 'reseau' };
}
