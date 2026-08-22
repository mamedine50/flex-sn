import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Le dossier conducteur : choisir une pièce, la réduire, la déposer.
 *
 * La réduction à 1200 px se fait AVANT l'envoi. Baisser la qualité JPEG sans
 * toucher aux dimensions ne réduit presque rien : une photo d'iPhone fait
 * 4000 px de large, et c'est la largeur qui pèse. Sur une 3G sénégalaise, un
 * envoi de 6 Mo échoue avant d'aboutir.
 */
export type TypeDocument = Database['public']['Enums']['type_document'];
export type StatutDocument = Database['public']['Enums']['statut_document'];
export type Document = Database['public']['Tables']['documents_conducteur']['Row'];

/**
 * Les cinq pièces, dans l'ordre où on les demande.
 *
 * L'ORDRE N'EST PAS ALPHABÉTIQUE. On commence par ce que le candidat a déjà en
 * poche — carte d'identité, permis, carte grise — et on finit par les deux
 * photos qu'il doit PRENDRE : le selfie tenant son permis, puis sa voiture.
 * Demander une photo à faire en premier, c'est renvoyer quelqu'un dehors avant
 * qu'il ait commencé.
 */
export const PIECES: TypeDocument[] = [
  'piece_identite',
  'permis',
  'carte_grise',
  'selfie',
  'photo_vehicule',
];

const LARGEUR_MAX = 1200;

/** Réduit à 1200 px de large, puis compresse. Dans cet ordre. */
export async function reduire(uri: string) {
  const contexte = ImageManipulator.ImageManipulator.manipulate(uri);
  contexte.resize({ width: LARGEUR_MAX });
  const image = await contexte.renderAsync();
  return image.saveAsync({
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
}

export type ResultatDepot =
  | { ok: true }
  | { ok: false; cle: 'annule' | 'permission' | 'envoi' };

/**
 * Choisit une image, la réduit, la dépose, et déclare le chemin en base.
 *
 * Le chemin commence par l'identifiant de l'utilisateur : c'est ce que
 * vérifient à la fois la policy de stockage et `soumettre_document()`.
 */
export async function deposerPiece(type: TypeDocument): Promise<ResultatDepot> {
  const selfie = type === 'selfie';

  const permission = selfie
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { ok: false, cle: 'permission' };

  const choix = selfie
    ? await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
      });
  if (choix.canceled || !choix.assets?.[0]) return { ok: false, cle: 'annule' };

  const { data: session } = await supabase.auth.getUser();
  const uid = session.user?.id;
  if (!uid) return { ok: false, cle: 'envoi' };

  try {
    const reduite = await reduire(choix.assets[0].uri);
    const reponse = await fetch(reduite.uri);
    const octets = await reponse.arrayBuffer();

    const chemin = `${uid}/${type}.jpg`;
    const { error: erreurDepot } = await supabase.storage
      .from('documents-conducteur')
      .upload(chemin, octets, { contentType: 'image/jpeg', upsert: true });
    if (erreurDepot) return { ok: false, cle: 'envoi' };

    const { error } = await supabase.rpc('soumettre_document', {
      p_type: type,
      p_chemin: chemin,
    });
    if (error) return { ok: false, cle: 'envoi' };

    return { ok: true };
  } catch {
    return { ok: false, cle: 'envoi' };
  }
}

export type StatutDossier = 'chargement' | 'pret' | 'erreur';

/** Le dossier de l'utilisateur courant. */
export function useDossier() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [statut, setStatut] = useState<StatutDossier>('chargement');

  const relire = useCallback(async (marqueur: { annule: boolean } | null) => {
    const { data, error } = await supabase.from('documents_conducteur').select('*');
    if (marqueur?.annule) return;

    // Une lecture qui échoue n'est pas un dossier vide. Sans cette distinction
    // l'écran annoncerait « il manque quatre pièces » à quelqu'un qui vient
    // justement de les déposer, et lui ferait tout refaire.
    if (error) {
      setStatut('erreur');
      return;
    }

    setDocuments(data ?? []);
    setStatut('pret');
  }, []);

  useEffect(() => {
    const marqueur = { annule: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);
    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(marqueur));
    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
    };
  }, [relire]);

  return { documents, statut, relire: () => void relire(null) };
}
