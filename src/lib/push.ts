import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { cheminNotification } from './cheminNotification';
import { supabase } from './supabase';

/**
 * Les notifications qui traversent un téléphone verrouillé.
 *
 * ── CE QUE LA TABLE NE POUVAIT PAS FAIRE ───────────────────────────────────
 * `notifications` rattrape tout ce qu'on a manqué — mais seulement quand on
 * rouvre l'application. Un passager qui attend dehors, téléphone en poche,
 * n'apprend que son conducteur est arrivé qu'en ressortant le téléphone. Le
 * push est la seule chose qui traverse un écran verrouillé.
 *
 * ── LE PUSH EST UN BONUS, LA TABLE EST LA VÉRITÉ ───────────────────────────
 * Tout ce qui suit peut échouer sans conséquence : permission refusée, jeton
 * périmé, Expo en panne, téléphone sans services Google. La notification est
 * déjà en base et l'écran la montrera au prochain regard. AUCUNE erreur ici ne
 * remonte à l'utilisateur — il n'y a rien qu'il puisse en faire.
 *
 * ── ON NE DEMANDE PAS LA PERMISSION À L'OUVERTURE ──────────────────────────
 * `enregistrerAppareil()` n'est appelée qu'après la connexion, quand la
 * personne a déjà fait quelque chose de l'application. Une boîte de dialogue
 * système au premier écran, avant même de savoir ce que fait le produit, se
 * refuse par réflexe — et iOS ne la repose JAMAIS. On n'a qu'une seule
 * occasion, on ne la dépense pas sur un inconnu.
 */

/**
 * Ce qu'on fait d'une notification qui arrive PENDANT qu'on regarde l'écran.
 *
 * On l'affiche quand même : elle peut concerner un autre écran que celui qu'on
 * a sous les yeux — un message arrive pendant qu'on consulte ses gains. Mais
 * sans son : le téléphone est déjà dans la main, le bruit ne sert à rien.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Attache cet appareil au compte connecté.
 *
 * Silencieuse par construction : elle rend `false` et n'explique rien. Le seul
 * appelant est la porte d'entrée de l'application, qui n'a rien à en dire.
 */
export async function enregistrerAppareil(): Promise<boolean> {
  // Un simulateur n'a pas de jeton push. Sans ce test, on demanderait une
  // permission qui ne mène nulle part à chaque lancement de développement.
  if (!Device.isDevice) return false;

  try {
    const { status: existant } = await Notifications.getPermissionsAsync();
    let statut = existant;

    // On ne redemande pas ce qui a été refusé : iOS ne repose pas la question,
    // et l'appel retourne immédiatement le même refus. Autant l'économiser.
    if (statut === 'undetermined') {
      const { status } = await Notifications.requestPermissionsAsync();
      statut = status;
    }
    if (statut !== 'granted') return false;

    const { data: jeton } = await Notifications.getExpoPushTokenAsync();
    if (!jeton) return false;

    const { error } = await supabase.rpc('enregistrer_jeton_push', {
      p_jeton: jeton,
      p_plateforme: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return !error;
  } catch {
    // Pas de services Google, appareil non enregistré, réseau coupé. Rien de
    // tout ça ne mérite d'atteindre quelqu'un qui voulait commander une course.
    return false;
  }
}

/**
 * Détache cet appareil, à la déconnexion.
 *
 * Sans ça, le téléphone continuerait de recevoir les notifications de quelqu'un
 * qui s'est délibérément déconnecté — le contraire exact de ce qu'il a demandé,
 * et sur un appareil qu'il a peut-être rendu.
 */
export async function oublierAppareil(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const { data: jeton } = await Notifications.getExpoPushTokenAsync();
    if (!jeton) return;
    await supabase.rpc('oublier_jeton_push', { p_jeton: jeton });
  } catch {
    // Idem : un échec ici ne change rien pour la personne.
  }
}

/** Branche l'appui sur une notification. Un seul appelant : la porte d'entrée. */
export function useAppuiPush(aller: (chemin: string) => void) {
  useEffect(() => {
    const abonnement = Notifications.addNotificationResponseReceivedListener((reponse) => {
      // LA CHARGE UTILE EST UN POINTEUR, PAS UN FAIT. On y lit seulement OÙ
      // aller ; l'écran d'arrivée relit l'état courant. Entre l'envoi et
      // l'appui il a pu s'écouler une nuit.
      const donnees = reponse.notification.request.content.data as { genre?: string } | null;
      aller(cheminNotification(donnees?.genre));
    });
    return () => abonnement.remove();
  }, [aller]);
}
