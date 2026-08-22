import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useT } from '../i18n';
import { noterMesure } from '../lib/gabarit';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Glisser pour confirmer.
 *
 * POUR CE QUI CHANGE L'ÉTAT D'UNE COURSE, ET RIEN D'AUTRE. Démarrer et terminer
 * décident de l'argent : une course démarrée trop tôt fait payer une attente,
 * une course terminée trop tôt coupe le suivi en pleine route. Ces deux gestes-là
 * ne doivent pas pouvoir se faire dans une poche, ni d'un doigt qui glisse sur
 * un téléphone posé sur un tableau de bord.
 *
 * Message, Appeler, Sécurité et la notation restent des appuis : un glissement
 * sur une action fréquente est une punition, pas une sécurité.
 *
 * 85 % DE LA COURSE, PAS 100. Atteindre le bout exact demande de la précision au
 * pouce, au volant, souvent en plein soleil. En dessous, la pastille revient à
 * sa place — le geste avorté ne fait rien et ne dit rien, ce qui est la bonne
 * réponse : on n'avertit pas quelqu'un qui a hésité.
 *
 * DÉSACTIVÉ, IL DIT POURQUOI. Une piste grise sans phrase se lit comme une
 * panne. Un état désactivé change de COULEUR, pas seulement d'opacité — un aplat
 * clair à 50 % reste lumineux et l'on croit le contrôle actif.
 */
const PASTILLE = 56;
const SEUIL = 0.85;

export default function GlisserPourConfirmer({
  texte,
  raisonInactive,
  occupe = false,
  onConfirmer,
  nom,
}: {
  texte: string;
  /** Non vide = inactif. C'est la phrase qui s'affiche sous la piste. */
  raisonInactive?: string | null;
  occupe?: boolean;
  onConfirmer: () => void;
  /** Pour l'assertion de gabarit. */
  nom?: string;
}) {
  const t = useT();
  const { couleurs, radius } = useTheme();
  const [largeur, setLargeur] = useState(0);

  const inactif = Boolean(raisonInactive) || occupe;
  const course = Math.max(0, largeur - PASTILLE - 8);

  const x = useSharedValue(0);

  const declencher = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirmer();
  };

  const geste = Gesture.Pan()
    .enabled(!inactif && course > 0)
    .onChange((e) => {
      x.value = Math.max(0, Math.min(course, x.value + e.changeX));
    })
    .onEnd(() => {
      if (x.value >= course * SEUIL) {
        x.value = withSpring(course, { damping: 20 });
        runOnJS(declencher)();
      } else {
        x.value = withSpring(0, { damping: 20 });
      }
    });

  const pastille = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  // La piste se remplit DERRIÈRE la pastille : le remplissage est la mesure du
  // geste, pas une décoration. Sans lui, on ne sait pas si l'on a assez glissé.
  const remplissage = useAnimatedStyle(() => ({
    width: x.value + PASTILLE,
  }));

  return (
    <View>
      <View
        onLayout={(e: LayoutChangeEvent) => {
          setLargeur(e.nativeEvent.layout.width);
          // C'est la PISTE qu'on mesure : sa hauteur décide si la pastille tient
          // sous le pouce. La phrase du dessous, elle, dépend de la traduction.
          if (nom) noterMesure(nom, e.nativeEvent.layout.height);
        }}
        // 64 n'est PAS dans l'échelle d'espacement : `h-64` serait ignoré par
        // NativeWind, sans un mot, et la piste prendrait la hauteur de son
        // texte. Les crochets sont la seule façon d'écrire une valeur hors
        // échelle — et l'assertion ne l'aurait pas vu, car la hauteur de repli
        // dépassait déjà le seuil.
        className="h-[64px] justify-center overflow-hidden rounded-button"
        style={{ backgroundColor: inactif ? couleurs.card2 : couleurs.card }}
      >
        {!inactif ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                backgroundColor: couleurs.accFill,
                borderRadius: radius.button,
              },
              remplissage,
            ]}
          />
        ) : null}

        <Text
          className="px-16 text-center text-[15px] font-extrabold"
          style={{ color: inactif ? couleurs.muted : couleurs.ink }}
          numberOfLines={1}
        >
          {occupe ? t('commun.chargement') : texte}
        </Text>

        <GestureDetector gesture={geste}>
          <Animated.View
            accessibilityRole="adjustable"
            accessibilityLabel={texte}
            accessibilityState={{ disabled: inactif }}
            // Le lecteur d'écran ne glisse pas : il actionne. Sans cette
            // alternative, l'action serait purement gestuelle, donc inatteignable.
            accessibilityActions={[{ name: 'activate' }]}
            onAccessibilityAction={() => (inactif ? undefined : declencher())}
            style={[
              {
                position: 'absolute',
                left: 4,
                width: PASTILLE,
                height: PASTILLE,
                borderRadius: radius.button,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: inactif ? couleurs.line : couleurs.accFill,
              },
              pastille,
            ]}
          >
            <Text
              className="text-[20px] font-extrabold"
              style={{ color: inactif ? couleurs.muted : couleurs.onAcc }}
            >
              ›
            </Text>
          </Animated.View>
        </GestureDetector>
      </View>

      {raisonInactive ? (
        <Text className="mt-8 text-center text-[12px] font-semibold text-muted">
          {raisonInactive}
        </Text>
      ) : null}
    </View>
  );
}
