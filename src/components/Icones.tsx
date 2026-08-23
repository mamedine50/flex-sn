import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Les icônes des lignes du Profil, chacune dans sa pastille `card2`.
 *
 * C'est la pastille qui rend les groupes lisibles sans lire : l'œil suit une
 * colonne de formes avant de suivre une colonne de mots. Trait de 2, pas de
 * remplissage, `accInk` — la même encre que les actions secondaires.
 *
 * Dessinées ici plutôt qu'importées : une police d'icônes, c'est 60 à 200 Ko
 * embarqués pour douze signes, sur un budget d'APK de 30 Mo tenu au kilo-octet.
 */
export type NomIcone =
  | 'domicile'
  | 'travail'
  | 'lieu'
  | 'plus'
  | 'volant'
  | 'gains'
  | 'documents'
  | 'theme'
  | 'langue'
  | 'bloque'
  | 'aide'
  | 'infos'
  | 'cloche'
  | 'sortie';

const TAILLE = 20;

const CHEMINS: Record<NomIcone, () => React.ReactNode> = {
  domicile: () => <Path d="M3 10 L12 3 L21 10 V20 A1 1 0 0 1 20 21 H4 A1 1 0 0 1 3 20 Z M9 21 V14 H15 V21" />,
  travail: () => (
    <>
      <Rect x={3} y={7} width={18} height={14} rx={2} />
      <Path d="M8 7 V5 A2 2 0 0 1 10 3 H14 A2 2 0 0 1 16 5 V7" />
    </>
  ),
  lieu: () => (
    <>
      <Path d="M12 21 C12 21 5 14.5 5 10 A7 7 0 0 1 19 10 C19 14.5 12 21 12 21 Z" />
      <Circle cx={12} cy={10} r={2.5} />
    </>
  ),
  plus: () => <Path d="M12 5 V19 M5 12 H19" />,
  // Une cloche : le corps, le battant, et l'anse. Dessinée au même trait que
  // les autres — un jeu d'icônes se reconnaît à sa graisse, pas à ses formes.
  cloche: () => (
    <>
      <Path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z" />
      <Path d="M10 18 A2 2 0 0 0 14 18" />
    </>
  ),
  volant: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={12} r={3} />
      <Path d="M12 3 V9 M3.5 14 L9.2 13 M20.5 14 L14.8 13" />
    </>
  ),
  gains: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7 V17 M9.5 9.5 H14 A2 2 0 0 1 14 13.5 H10 A2 2 0 0 0 10 17.5 H14.5" />
    </>
  ),
  documents: () => (
    <>
      <Path d="M14 3 H7 A2 2 0 0 0 5 5 V19 A2 2 0 0 0 7 21 H17 A2 2 0 0 0 19 19 V8 Z" />
      <Path d="M14 3 V8 H19 M9 13 H15 M9 17 H13" />
    </>
  ),
  theme: () => (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 4 A8 8 0 0 0 12 20 Z" />
    </>
  ),
  langue: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12 H21 M12 3 C15 6.5 15 17.5 12 21 C9 17.5 9 6.5 12 3 Z" />
    </>
  ),
  bloque: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M5.6 5.6 L18.4 18.4" />
    </>
  ),
  aide: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M9.2 9.2 A2.9 2.9 0 1 1 12 13 V14.6" />
      <Circle cx={12} cy={17.6} r={0.6} />
    </>
  ),
  infos: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11 V16.5" />
      <Circle cx={12} cy={7.8} r={0.6} />
    </>
  ),
  sortie: () => <Path d="M15 4 H19 A1 1 0 0 1 20 5 V19 A1 1 0 0 1 19 20 H15 M11 16 L15 12 L11 8 M15 12 H4" />,
};

/** L'icône seule, sans pastille — pour un usage en ligne. */
export function Icone({ nom, couleur }: { nom: NomIcone; couleur?: string }) {
  const { couleurs } = useTheme();
  return (
    <Svg
      width={TAILLE}
      height={TAILLE}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur ?? couleurs.accInk}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {CHEMINS[nom]()}
    </Svg>
  );
}

/** L'icône dans sa pastille. C'est la forme utilisée par les lignes du Profil. */
export function Pastille({ nom, danger = false }: { nom: NomIcone; danger?: boolean }) {
  const { couleurs } = useTheme();
  return (
    // 32 et pas 40 : l'échelle d'espacement s'arrête à 4, 8, 12, 16, 24, 32,
    // 48, et NativeWind ignore SANS RIEN DIRE une classe hors échelle. Une
    // pastille invisible passerait la revue.
    <View className="h-32 w-32 items-center justify-center rounded-field bg-card2">
      <Icone nom={nom} couleur={danger ? couleurs.danger : couleurs.accInk} />
    </View>
  );
}
