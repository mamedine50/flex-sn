import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Les illustrations des deux tuiles, reprises de `docs/maquettes.html`.
 *
 * Elles sont décoratives : `accessibilityElementsHidden` évite qu'un lecteur
 * d'écran annonce une voiture avant le titre de la tuile.
 */

const LARGEUR = 132;
const HAUTEUR = 96;

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <Svg
      width={LARGEUR}
      height={HAUTEUR}
      viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Svg>
  );
}

export function VoitureUrbaine() {
  const { couleurs } = useTheme();
  return (
    <Cadre>
      <Path
        d="M74 4 L124 16 L100 44 L130 56 L74 92 L88 54 L58 44 Z"
        fill={couleurs.accFill}
        opacity={0.9}
      />
      <G
        fill={couleurs.card2}
        stroke={couleurs.ink}
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <Path d="M10 74 L14 58 C15.5 53 20 50 25 50 L62 50 C66 50 69 51.5 72 54 L82 64 L94 67 C98 68 101 71 101 75 L101 80 L10 80 Z" />
        <Circle cx={30} cy={80} r={7.5} />
        <Circle cx={82} cy={80} r={7.5} />
        <Path d="M28 50 L32 39 C33.5 35 36.5 33 40 33 L60 33 C63.5 33 66 35 67.5 39 L71 50" />
      </G>
    </Cadre>
  );
}

export function VoitureInterurbaine() {
  const { couleurs } = useTheme();
  return (
    <Cadre>
      <Path
        d="M80 6 L126 20 L104 44 L130 58 L78 92 L90 56 L62 46 Z"
        fill={couleurs.accFill}
        opacity={0.9}
      />
      <G
        fill={couleurs.card2}
        stroke={couleurs.ink}
        strokeWidth={3.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <Path d="M8 76 L12 60 C13.5 55 18 52 23 52 L56 52 C60 52 63 53.5 66 56 L76 66 L88 69 C92 70 95 73 95 77 L95 82 L8 82 Z" />
        <Circle cx={28} cy={82} r={7.5} />
        <Circle cx={78} cy={82} r={7.5} />
        <Rect x={96} y={56} width={22} height={26} rx={3} />
        <Path d="M96 66 H118" />
      </G>
    </Cadre>
  );
}

/** La loupe de la barre de recherche. */
export function Loupe() {
  const { couleurs } = useTheme();
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" accessibilityElementsHidden>
      <Circle
        cx={8.5}
        cy={8.5}
        r={6.5}
        stroke={couleurs.muted}
        strokeWidth={2}
        fill="none"
      />
      <Path
        d="M13.5 13.5 L18 18"
        stroke={couleurs.muted}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
