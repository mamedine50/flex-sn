import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';

import { reduire, type ResultatDepot } from './documents';
import { supabase } from './supabase';

/**
 * La photo de profil.
 *
 * Le dépôt `photos-profil` est privé : la base garde le CHEMIN, et l'affichage
 * demande une URL signée. Une photo de visage indexable par un moteur de
 * recherche est un problème qu'on ne se crée pas.
 */
const DEPOT = 'photos-profil';

/** Une heure : plus long qu'une course, plus court qu'une session. */
const VALIDITE_S = 3600;

export async function deposerPhotoProfil(): Promise<ResultatDepot> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { ok: false, cle: 'permission' };

  const choix = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
  if (choix.canceled || !choix.assets?.[0]) return { ok: false, cle: 'annule' };

  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return { ok: false, cle: 'envoi' };

  try {
    const { data: avant } = await supabase
      .from('profiles')
      .select('photo_url')
      .eq('id', uid)
      .maybeSingle();

    const reduite = await reduire(choix.assets[0].uri);
    const octets = await (await fetch(reduite.uri)).arrayBuffer();

    // Un chemin UNIQUE par dépôt. Sous chemin fixe, l'image resterait celle
    // d'avant : ni le cache image ni l'URL déjà signée ne savent qu'elle a
    // changé.
    const chemin = `${uid}/profil-${Date.now()}.jpg`;
    const { error: erreurDepot } = await supabase.storage
      .from(DEPOT)
      .upload(chemin, octets, { contentType: 'image/jpeg' });
    if (erreurDepot) return { ok: false, cle: 'envoi' };

    const { error } = await supabase.rpc('maj_photo_profil', { p_chemin: chemin });
    if (error) return { ok: false, cle: 'envoi' };

    // L'ancienne part APRÈS que la nouvelle est déclarée : dans l'autre ordre,
    // un échec au milieu laisserait un profil qui pointe sur rien.
    if (avant?.photo_url && avant.photo_url !== chemin) {
      await supabase.storage.from(DEPOT).remove([avant.photo_url]);
      cache.delete(avant.photo_url);
    }

    return { ok: true };
  } catch {
    return { ok: false, cle: 'envoi' };
  }
}

/** chemin → { url, expire }. Une URL signée coûte un aller-retour ; une liste
 *  d'offres en demanderait un par ligne à chaque rendu. */
const cache = new Map<string, { url: string; expire: number }>();

/**
 * L'URL signée d'une photo. `null` tant qu'elle n'est pas prête, et `null` pour
 * toujours si la signature échoue — l'avatar retombe alors sur l'initiale, ce
 * qui est exactement ce qu'il faut montrer.
 */
export function useUrlPhoto(chemin?: string | null): string | null {
  const [signees, setSignees] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!chemin) return;

    const connue = cache.get(chemin);
    if (connue && connue.expire > Date.now()) return;

    const vivant = { annule: false };
    void (async () => {
      const { data } = await supabase.storage
        .from(DEPOT)
        .createSignedUrl(chemin, VALIDITE_S);
      if (vivant.annule || !data?.signedUrl) return;

      // On périme une minute avant l'échéance réelle : une image qui commence à
      // se charger à la seconde près échouerait.
      cache.set(chemin, {
        url: data.signedUrl,
        expire: Date.now() + (VALIDITE_S - 60) * 1000,
      });
      setSignees((etat) => ({ ...etat, [chemin]: data.signedUrl }));
    })();

    return () => {
      vivant.annule = true;
    };
  }, [chemin]);

  if (!chemin) return null;
  return signees[chemin] ?? cache.get(chemin)?.url ?? null;
}
