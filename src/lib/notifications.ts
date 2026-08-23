import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { Database } from './database.types';
import { supabase } from './supabase';

/**
 * Ce qui s'est passé pendant qu'on ne regardait pas.
 *
 * ── PAS DE TEMPS RÉEL ICI, ET C'EST UN CHOIX CHIFFRÉ ───────────────────────
 * Le plan Supabase gratuit accorde 200 connexions simultanées. Chaque canal
 * ouvert en consomme une, et un utilisateur en tient déjà deux ou trois — la
 * course, les offres. Brancher la pastille sur le temps réel ajouterait un
 * canal PERMANENT par personne connectée, même immobile : le pire rapport
 * coût/bénéfice du produit, pour une pastille qui n'a pas besoin d'être juste
 * à la seconde.
 *
 * On relit donc aux trois moments où quelqu'un regarde vraiment : au retour au
 * premier plan, en arrivant sur un écran, et à l'ouverture de session — une
 * session qui s'ouvre change ce que la RLS laisse voir.
 *
 * Le temps réel reste où une seconde de retard se VOIT : le fil de discussion
 * et la liste des offres.
 *
 * ── LA NOTIFICATION EST UN POINTEUR, PAS UN FAIT ───────────────────────────
 * Elle ne porte ni phrase ni prénom : un genre, des identifiants, un montant.
 * L'écran écrit la phrase dans la langue courante et va chercher le nom là où
 * la RLS le sert. En l'ouvrant, on RELIT l'état courant : si l'offre a expiré
 * entre-temps, on voit la vérité et non le souvenir.
 */
export type Notification = Database['public']['Tables']['notifications']['Row'];

export type EtatNotifications = {
  statut: 'chargement' | 'pret' | 'erreur';
  notifications: Notification[];
  /** Ce que porte la pastille. Zéro = pas de pastille du tout. */
  nonLues: number;
};

const VIDE: Notification[] = [];

export function useNotifications(actif = true) {
  const [etat, setEtat] = useState<EtatNotifications>({
    statut: 'chargement',
    notifications: VIDE,
    nonLues: 0,
  });

  const relire = useCallback(
    async (marqueur: { annule: boolean } | null) => {
      if (!actif) return;

      // Cinquante : au-delà, personne ne fait défiler une boîte de
      // notifications, il la vide ou il l'ignore.
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('cree_le', { ascending: false })
        .limit(50);

      if (marqueur?.annule) return;

      if (error || !data) {
        setEtat({ statut: 'erreur', notifications: VIDE, nonLues: 0 });
        return;
      }

      setEtat({
        statut: 'pret',
        notifications: data,
        nonLues: data.filter((n) => n.lu_le === null).length,
      });
    },
    [actif],
  );

  useEffect(() => {
    if (!actif) return undefined;
    const marqueur = { annule: false };

    // Faux positif : tout `setState` de `relire` suit un `await` réseau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void relire(marqueur);

    const { data: veille } = supabase.auth.onAuthStateChange(() => void relire(marqueur));
    const abonnement = AppState.addEventListener('change', (etatApp) => {
      if (etatApp === 'active') void relire(marqueur);
    });

    return () => {
      marqueur.annule = true;
      veille.subscription.unsubscribe();
      abonnement.remove();
    };
  }, [actif, relire]);

  return { ...etat, relire: () => void relire(null) };
}

/**
 * La même lecture, rafraîchie en ARRIVANT sur un écran.
 *
 * Séparée du crochet principal parce que `useFocusEffect` exige un écran de
 * navigation : un composant monté ailleurs planterait. La pastille de l'accueil
 * et la boîte l'utilisent, pas les autres.
 */
export function useNotificationsAuFocus(actif = true) {
  const boite = useNotifications(actif);
  const premier = useRef(true);

  useFocusEffect(
    useCallback(() => {
      // Le premier focus coïncide avec le montage : le relancer ferait deux
      // requêtes à l'ouverture, sur une 3G où chacune se paie.
      if (premier.current) {
        premier.current = false;
        return;
      }
      boite.relire();
    }, [boite]),
  );

  return boite;
}

/** Vide la pastille. Sans identifiant : la fonction n'agit que sur `auth.uid()`. */
export async function marquerLues(): Promise<number> {
  const { data, error } = await supabase.rpc('marquer_notifications_lues');
  return error ? 0 : (data ?? 0);
}
