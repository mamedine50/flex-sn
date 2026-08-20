import { useEffect, useState } from 'react';

import type { Lieu } from './lieuxOrdre';
import { supabase } from './supabase';

export { chercherLieux, GLYPHE, RANG, type Lieu } from './lieuxOrdre';

/**
 * Les lieux qu'on cherche : quartiers, arrêts et points de repère.
 *
 * Lus une fois et gardés en mémoire — mille cinq cents lignes, c'est un
 * chargement, pas une requête par frappe. Le filtrage est LOCAL : aucun appel à
 * un service de lieux, jamais.
 *
 * Rien de cette table n'est servi au conducteur avant acceptation : un passager
 * qui part du Radisson apparaît « vers Almadies ». C'est la commune qui franchit
 * la frontière, jamais le lieu fin — et une assertion de 080 le vérifie.
 */
export function useLieux() {
  const [lieux, setLieux] = useState<Lieu[]>([]);

  useEffect(() => {
    const marqueur = { annule: false };

    void (async () => {
      const { data } = await supabase
        .from('lieux')
        .select('code, nom, alias, categorie, lat, lon');
      if (!marqueur.annule && data) setLieux(data);
    })();

    return () => {
      marqueur.annule = true;
    };
  }, []);

  return lieux;
}
