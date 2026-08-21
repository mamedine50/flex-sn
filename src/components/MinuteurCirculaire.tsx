import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { chiffresTabulaires } from '../theme/typographie';

/**
 * Le temps qui reste à une demande, en anneau.
 *
 * « encore 4 min » ne dit pas s'il en restait dix ou cinq : c'est un chiffre
 * sans échelle. Un anneau qui se vide donne la PROPORTION d'un coup d'œil, et
 * c'est ce qu'on regarde quand on hésite à accepter une contre-offre.
 *
 * Le chiffre reste au centre, en tabulaire — sans quoi il tressaute à chaque
 * seconde et l'écran paraît instable. Même règle que pour les montants.
 *
 * L'anneau ne s'anime pas : il se redessine une fois par seconde, avec le
 * compte à rebours qui vit déjà dans l'écran. Une animation continue coûterait
 * une boucle de rendu permanente pour une information qui change au dixième de
 * degré près.
 */
const TAILLE = 46;
const RAYON = 20;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

export default function MinuteurCirculaire({
  secondesRestantes,
  secondesTotal,
}: {
  secondesRestantes: number;
  secondesTotal: number;
}) {
  const { couleurs } = useTheme();

  const part =
    secondesTotal > 0
      ? Math.max(0, Math.min(1, secondesRestantes / secondesTotal))
      : 0;

  const minutes = Math.floor(secondesRestantes / 60);
  const secondes = secondesRestantes % 60;
  const texte = `${minutes}:${String(secondes).padStart(2, '0')}`;

  return (
    <View className="h-[46px] w-[46px] items-center justify-center">
      <Svg
        width={TAILLE}
        height={TAILLE}
        viewBox={`0 0 ${TAILLE} ${TAILLE}`}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={TAILLE / 2}
          cy={TAILLE / 2}
          r={RAYON}
          fill="none"
          stroke={couleurs.line}
          strokeWidth={3}
        />
        <Circle
          cx={TAILLE / 2}
          cy={TAILLE / 2}
          r={RAYON}
          fill="none"
          stroke={couleurs.accInk}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={CIRCONFERENCE}
          strokeDashoffset={CIRCONFERENCE * (1 - part)}
        />
      </Svg>
      <Text
        className="text-[13px] font-extrabold text-accInk"
        style={chiffresTabulaires}
      >
        {texte}
      </Text>
    </View>
  );
}
