import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Le radar de l'attente.
 *
 * L'écran des offres passe la plupart de son temps SANS offre — entre la
 * proposition et la première réponse. Un grand blanc à cet instant se lit comme
 * une panne : on vient d'appuyer sur un bouton et il ne se passe rien. Trois
 * anneaux qui partent du centre disent la seule chose vraie à ce moment-là :
 * ça cherche.
 *
 * TROIS ANNEAUX DÉCALÉS, PAS UN QUI CLIGNOTE. Le décalage fait la lecture : on
 * voit une propagation, donc une recherche qui s'étend. Un seul anneau qui
 * réapparaît au même endroit se lit comme un défaut d'affichage.
 *
 * `prefers-reduced-motion` : le point reste, les anneaux se figent à mi-course.
 * La forme continue de dire « on cherche » sans rien faire bouger. On ne rend
 * pas un écran vide à quelqu'un qui a désactivé les animations — il a demandé
 * moins de mouvement, pas moins d'information.
 */

const TAILLE = 120;
const CYCLE_MS = 2400;

export default function RadarAttente() {
  const { couleurs } = useTheme();
  const [mouvementReduit, setMouvementReduit] = useState<boolean | null>(null);

  useEffect(() => {
    let vivant = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduit) => {
      if (vivant) setMouvementReduit(reduit);
    });
    return () => {
      vivant = false;
    };
  }, []);

  return (
    <View
      className="h-[120px] w-[120px] items-center justify-center"
      accessibilityRole="progressbar"
      accessibilityLabel=""
    >
      {[0, 1, 2].map((i) => (
        <Anneau
          key={i}
          index={i}
          couleur={couleurs.accInk}
          anime={mouvementReduit === false}
        />
      ))}
      <View
        className="h-[14px] w-[14px] rounded-full"
        style={{ backgroundColor: couleurs.accInk }}
      />
    </View>
  );
}

function Anneau({
  index,
  couleur,
  anime,
}: {
  index: number;
  couleur: string;
  anime: boolean;
}) {
  // À mi-course : la valeur figée quand le mouvement est réduit. Les anneaux
  // restent visibles, ils ne bougent plus.
  const avancee = useSharedValue(anime ? 0 : 0.5);

  useEffect(() => {
    if (!anime) {
      avancee.value = 0.5;
      return undefined;
    }
    avancee.value = withDelay(
      (index * CYCLE_MS) / 3,
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(avancee);
  }, [anime, index, avancee]);

  const style = useAnimatedStyle(() => ({
    // De 0,3 à 1 : un anneau qui naîtrait à zéro disparaîtrait derrière le
    // point central, et le cycle aurait l'air de commencer en retard.
    transform: [{ scale: 0.3 + avancee.value * 0.7 }],
    opacity: 0.7 * (1 - avancee.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: TAILLE,
          height: TAILLE,
          borderRadius: TAILLE / 2,
          borderWidth: 2,
          borderColor: couleur,
        },
        style,
      ]}
    />
  );
}
