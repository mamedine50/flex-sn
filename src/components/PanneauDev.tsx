import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { useSession } from '../lib/session';
import { fermerSessionDeTest, ouvrirSessionDeTest } from '../lib/sessionDev';

/**
 * Panneau de développement — forcer un état, ouvrir une session sans OTP.
 *
 * Un état qu'on ne sait pas déclencher est un état qu'on n'a pas. Couper le
 * réseau d'un simulateur, refuser une permission déjà accordée ou attendre un
 * SMS qui n'arrivera pas coûtent assez cher pour qu'on ne le fasse jamais, et
 * l'état finit livré sans avoir été vu.
 *
 * Rendu UNIQUEMENT sous `__DEV__` : l'appel est gardé chez l'appelant, et ce
 * fichier n'est pas dans le graphe de production.
 *
 * Les libellés ne passent pas par `src/i18n` — délibérément. Ce panneau n'est
 * pas l'interface, il ne sera jamais traduit, et le polluer de clés jetables
 * abîmerait le dictionnaire.
 */

export const ETATS_FORCABLES = [
  { cle: 'aucun', libelle: 'Aucun — comportement réel' },
  { cle: 'jamais_demandee', libelle: 'Position : jamais demandée' },
  { cle: 'en_cours', libelle: 'Position : acquisition en cours' },
  { cle: 'obtenue', libelle: 'Position : obtenue' },
  { cle: 'refusee', libelle: 'Position : refusée' },
  { cle: 'hors_ligne', libelle: 'Réseau : hors ligne' },
  { cle: 'carte_muette', libelle: 'Carte : indisponible' },
  { cle: 'bornes_chargement', libelle: 'Bornes de prix : chargement' },
  { cle: 'bornes_erreur', libelle: 'Bornes de prix : indisponibles' },
  { cle: 'envoi_en_cours', libelle: 'Envoi : en cours' },
  { cle: 'envoi_refuse', libelle: 'Envoi : refusé par le serveur' },
] as const;

export type EtatForce = (typeof ETATS_FORCABLES)[number]['cle'];

type Props = {
  visible: boolean;
  actuel: EtatForce;
  onChoisir: (etat: EtatForce) => void;
  onFermer: () => void;
};

export default function PanneauDev({ visible, actuel, onChoisir, onFermer }: Props) {
  const session = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const basculerSession = async () => {
    setOccupe(true);
    const resultat =
      session.statut === 'connecte'
        ? await fermerSessionDeTest()
        : await ouvrirSessionDeTest();
    setMessage(resultat.ok ? null : resultat.message);
    setOccupe(false);
  };

  const etiquetteSession =
    session.statut === 'chargement'
      ? 'Session : …'
      : session.statut === 'connecte'
        ? `Session : ${session.session.user.email ?? session.session.user.id}`
        : 'Session : aucune';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      <Pressable className="flex-1 justify-end bg-bg/70" onPress={onFermer}>
        <Pressable className="rounded-t-sheet bg-card px-16 pb-32 pt-16">
          <Text className="text-[15px] font-extrabold text-ink">
            Développement
          </Text>
          <Text className="mb-12 mt-4 text-[12px] font-semibold text-muted">
            Appui long sur la pastille de départ pour revenir ici.
          </Text>

          {/* Session sans OTP : le fournisseur SMS n'est pas encore branché. */}
          <View className="mb-16 rounded-field bg-card2 p-12">
            <Text className="text-[12px] font-bold text-ink">{etiquetteSession}</Text>
            {message ? (
              <Text className="mt-4 text-[11px] font-semibold text-danger">{message}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={occupe}
              onPress={() => void basculerSession()}
              className="mt-8 min-h-touch justify-center rounded-field bg-accFill px-16"
              style={({ pressed }) => ({ opacity: pressed || occupe ? 0.6 : 1 })}
            >
              <Text className="text-[13px] font-bold text-onAcc">
                {session.statut === 'connecte'
                  ? 'Fermer la session'
                  : 'Ouvrir une session de test'}
              </Text>
            </Pressable>
          </View>

          {/* L'entrée produit du mode conducteur ira dans l'onglet Profil, qui
              n'existe pas encore. En attendant, elle est ici. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onFermer();
              router.push('/conducteur');
            }}
            className="mb-16 min-h-touch justify-center rounded-field bg-card2 px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-accInk">
              Ouvrir le mode conducteur
            </Text>
          </Pressable>

          <ScrollView>
            {ETATS_FORCABLES.map(({ cle, libelle }) => {
              const choisi = cle === actuel;
              return (
                <Pressable
                  key={cle}
                  accessibilityRole="button"
                  accessibilityState={{ selected: choisi }}
                  onPress={() => onChoisir(cle)}
                  className={`mb-8 min-h-touch justify-center rounded-field px-16 py-12 ${
                    choisi ? 'bg-accFill' : 'bg-card2'
                  }`}
                >
                  <Text
                    className={`text-[14px] font-bold ${choisi ? 'text-onAcc' : 'text-ink'}`}
                  >
                    {libelle}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
