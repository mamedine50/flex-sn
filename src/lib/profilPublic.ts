import { useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Ce qu'on peut montrer de quelqu'un d'autre : prénom, photo, et la note — ou le
 * badge qui la remplace tant qu'elle ne veut rien dire.
 *
 * La vue `profils_publics` ne porte ni nom complet ni numéro : c'est la
 * projection de colonnes qui tient la règle, pas une politesse du client.
 */
export type ProfilPublic = Database['public']['Views']['profils_publics']['Row'];

export function useProfilPublic(id?: string | null): ProfilPublic | null {
  // L'état est indexé par identifiant : changer de contrepartie ne laisse
  // jamais l'ancienne note affichée sous le nouveau prénom, même un rendu.
  const [connus, setConnus] = useState<Record<string, ProfilPublic>>({});

  useEffect(() => {
    if (!id) return;

    const vivant = { annule: false };
    void (async () => {
      const { data } = await supabase
        .from('profils_publics')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      // Un échec ne pose rien : l'écran montre alors le prénom seul, jamais un
      // chiffre inventé.
      if (vivant.annule || !data) return;
      setConnus((etat) => ({ ...etat, [id]: data }));
    })();

    return () => {
      vivant.annule = true;
    };
  }, [id]);

  return id ? (connus[id] ?? null) : null;
}
