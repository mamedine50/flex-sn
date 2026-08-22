import { useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Les courses passées, des deux côtés.
 *
 * La policy `rides_parties_prenantes` sert déjà toutes les courses où l'on est
 * passager OU conducteur, quel que soit le statut : il n'y avait rien à ouvrir
 * en base, seulement un écran à faire.
 *
 * On lit le prénom de la contrepartie par `profils_publics` — jamais la table
 * `profiles`, qui ne servirait le nom complet que pendant une course active, et
 * dont on n'a de toute façon pas besoin ici.
 */
export type Course = Database['public']['Tables']['rides']['Row'];

export type LigneHistorique = Course & {
  demande: Pick<
    Database['public']['Tables']['ride_requests']['Row'],
    'depart_libelle' | 'destination_libelle'
  > | null;
  /**
   * Le prénom de l'autre, lu par `profils_publics`.
   *
   * En une requête séparée plutôt que par une jointure : PostgREST joint par
   * clé étrangère, et il n'y en a pas vers une VUE. Aller chercher le prénom
   * dans `profiles` marcherait ici — mais c'est la table qui porte le nom
   * complet et le numéro, et on ne s'habitue pas à la lire quand une projection
   * publique existe.
   */
  contrepartie_prenom: string | null;
};

export function useHistorique() {
  const [courses, setCourses] = useState<LigneHistorique[]>([]);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [moi, setMoi] = useState<string | null>(null);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data: session } = await supabase.auth.getUser();
      const uid = session.user?.id ?? null;
      if (vivant.annule) return;
      setMoi(uid);

      const { data, error } = await supabase
        .from('rides')
        .select(
          '*, demande:ride_requests!rides_demande_id_fkey(depart_libelle, destination_libelle)',
        )
        .in('statut', ['terminee', 'annulee'])
        .order('verrouillee_le', { ascending: false })
        .limit(100);

      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      const lignes = (data ?? []) as LigneHistorique[];

      const autres = [
        ...new Set(
          lignes.map((c) => (c.conducteur_id === uid ? c.passager_id : c.conducteur_id)),
        ),
      ];

      if (autres.length > 0) {
        const { data: profils } = await supabase
          .from('profils_publics')
          .select('id, prenom')
          .in('id', autres);
        if (vivant.annule) return;
        const parId = new Map((profils ?? []).map((p) => [p.id, p.prenom]));
        for (const ligne of lignes) {
          ligne.contrepartie_prenom =
            parId.get(ligne.conducteur_id === uid ? ligne.passager_id : ligne.conducteur_id) ??
            null;
        }
      }

      setCourses(lignes);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, []);

  return { courses, statut, moi };
}
