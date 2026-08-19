import { useEffect, useState } from 'react';

import { supabase } from './supabase';

/**
 * La liste des communes, lue en base.
 *
 * C'est notre seul répertoire de lieux : aucun appel de recherche de lieu, qui
 * serait facturé et que la V1 s'interdit. La table sert donc à la fois à nommer
 * une zone et à choisir une destination.
 *
 * Limite assumée : ce sont des centroïdes approximatifs. Une destination choisie
 * ici pointe le centre de la commune, pas une adresse.
 */
export type Commune = {
  code: string;
  nom: string;
  region: string;
  lat: number;
  lon: number;
};

export type EtatCommunes =
  | { statut: 'chargement'; communes: [] }
  | { statut: 'pret'; communes: Commune[] }
  | { statut: 'erreur'; communes: [] };

export function useCommunes(): EtatCommunes {
  const [etat, setEtat] = useState<EtatCommunes>({ statut: 'chargement', communes: [] });

  useEffect(() => {
    const vivant = { annule: false };

    void (async () => {
      const { data, error } = await supabase
        .from('communes')
        .select('code, nom, region, lat, lon')
        .order('nom');

      if (vivant.annule) return;
      if (error || !data) {
        setEtat({ statut: 'erreur', communes: [] });
        return;
      }
      setEtat({ statut: 'pret', communes: data });
    })();

    return () => {
      vivant.annule = true;
    };
  }, []);

  return etat;
}

/**
 * Les communes proposées selon le service. En urbain on reste dans le Grand
 * Dakar ; en interurbain on en sort — proposer Ouakam comme destination
 * interurbaine n'aurait aucun sens.
 */
const REGIONS_DAKAR = ['Dakar', 'Pikine', 'Guédiawaye', 'Rufisque', 'Keur Massar'];

export function communesPour(communes: Commune[], service: 'urbain' | 'interurbain') {
  return communes.filter((c) =>
    service === 'urbain'
      ? REGIONS_DAKAR.includes(c.region)
      : !REGIONS_DAKAR.includes(c.region),
  );
}
