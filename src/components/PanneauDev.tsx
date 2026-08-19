import { Modal, Pressable, ScrollView, Text } from 'react-native';

/**
 * Panneau de développement — forcer un état à la main.
 *
 * Un état qu'on ne sait pas déclencher est un état qu'on n'a pas. Couper le
 * réseau d'un simulateur ou refuser une permission déjà accordée coûte assez
 * cher pour qu'on ne le fasse jamais, et l'état finit livré sans avoir été vu.
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
] as const;

export type EtatForce = (typeof ETATS_FORCABLES)[number]['cle'];

type Props = {
  visible: boolean;
  actuel: EtatForce;
  onChoisir: (etat: EtatForce) => void;
  onFermer: () => void;
};

export default function PanneauDev({ visible, actuel, onChoisir, onFermer }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      <Pressable className="flex-1 justify-end bg-bg/70" onPress={onFermer}>
        <Pressable className="rounded-t-sheet bg-card px-16 pb-32 pt-16">
          <Text className="text-[15px] font-extrabold text-ink">
            États forcés · développement
          </Text>
          <Text className="mb-12 mt-4 text-[12px] font-semibold text-muted">
            Appui long sur la pastille de départ pour revenir ici.
          </Text>

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
