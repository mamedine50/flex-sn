import { Modal, Pressable, Text, View } from 'react-native';

import { useT } from '../i18n';
import { Icone } from './Icones';

/**
 * Le pré-écran de localisation.
 *
 * Il s'affiche AVANT la boîte système, la toute première fois. La boîte
 * d'iOS ne dit pas pourquoi ni jusqu'où : elle demande, et un refus ne se
 * redemande jamais. Cette carte-ci explique, promet l'avant-plan seul, et laisse
 * partir sans rien accorder.
 *
 * « Plus tard » n'est pas un piège : l'écran reste utilisable, la pastille
 * « Choisir mon point de départ » fait le travail. La règle du dépôt tient —
 * jamais de demande au montage, jamais de relance après refus.
 */
export default function CarteLocalisation({
  visible,
  onAutoriser,
  onPlusTard,
}: {
  visible: boolean;
  onAutoriser: () => void;
  onPlusTard: () => void;
}) {
  const t = useT();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onPlusTard}>
      <View className="flex-1 items-center justify-center bg-bg/70 px-24">
        <View className="w-full rounded-card bg-card p-24">
          <View className="items-center">
            <View className="h-48 w-48 items-center justify-center rounded-pill bg-card2">
              <Icone nom="lieu" />
            </View>
          </View>

          <Text className="mt-16 text-center text-[19px] font-extrabold text-ink">
            {t('localisation.titre')}
          </Text>
          <Text className="mt-8 text-center text-[14px] font-semibold text-muted">
            {t('localisation.explication')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={onAutoriser}
            className="mt-24 min-h-driving items-center justify-center rounded-button bg-accFill"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[16px] font-extrabold text-onAcc">
              {t('localisation.autoriser')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onPlusTard}
            className="mt-8 min-h-touch items-center justify-center rounded-field bg-card2"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[14px] font-bold text-accInk">
              {t('localisation.plusTard')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
