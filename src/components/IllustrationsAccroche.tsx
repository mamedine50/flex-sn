import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Les illustrations de l'écran d'accroche.
 *
 * Même trait que les tuiles de l'accueil : aplat d'accent en fond, formes en
 * `card2` cerclées d'`ink`. Elles racontent LE produit, pas une voiture — le
 * prix proposé, puis les réponses qui arrivent.
 *
 * Provisoires : c'est une géométrie honnête, pas une identité. Une vraie
 * illustration se commande à quelqu'un dont c'est le métier.
 */

const LARGEUR = 240;
const HAUTEUR = 200;

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

/** Premier écran : vous posez le prix. Une main, un montant. */
export function AccrocheVotrePrix() {
  const { couleurs } = useTheme();
  return (
    <Cadre>
      <Path
        d="M150 12 L226 30 L190 70 L232 88 L150 148 L170 84 L128 70 Z"
        fill={couleurs.accFill}
        opacity={0.9}
      />
      <G
        fill={couleurs.card2}
        stroke={couleurs.ink}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* La bulle du passager : c'est lui qui parle en premier. */}
        <Path d="M20 40 L150 40 C158 40 164 46 164 54 L164 106 C164 114 158 120 150 120 L64 120 L40 146 L44 120 L20 120 C12 120 6 114 6 106 L6 54 C6 46 12 40 20 40 Z" />
      </G>
      {/* Le montant, en jeton d'argent : l'ambre appartient aux montants. */}
      <G fill={couleurs.moneyFill} stroke={couleurs.shapeOutline} strokeWidth={3}>
        <Rect x={30} y={62} width={30} height={36} rx={6} />
        <Rect x={68} y={62} width={30} height={36} rx={6} />
        <Rect x={106} y={62} width={30} height={36} rx={6} />
      </G>
    </Cadre>
  );
}

/** Deuxième écran : les conducteurs répondent. Plusieurs voix, un choix. */
export function AccrocheOnVousRepond() {
  const { couleurs } = useTheme();
  return (
    <Cadre>
      <Path
        d="M14 20 L88 8 L74 52 L118 46 L58 128 L70 76 L26 84 Z"
        fill={couleurs.accFill}
        opacity={0.9}
      />
      <G
        fill={couleurs.card2}
        stroke={couleurs.ink}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {/* Trois réponses, décalées : elles n'arrivent pas en même temps. */}
        <Path d="M96 24 L222 24 C230 24 236 30 236 38 L236 68 C236 76 230 82 222 82 L96 82 C88 82 82 76 82 68 L82 38 C82 30 88 24 96 24 Z" />
        <Path d="M72 96 L198 96 C206 96 212 102 212 110 L212 140 C212 148 206 154 198 154 L72 154 C64 154 58 148 58 140 L58 110 C58 102 64 96 72 96 Z" />
      </G>
      <G fill={couleurs.ok} stroke={couleurs.shapeOutline} strokeWidth={3}>
        <Circle cx={110} cy={53} r={14} />
      </G>
      <G fill={couleurs.moneyFill} stroke={couleurs.shapeOutline} strokeWidth={3}>
        <Circle cx={86} cy={125} r={14} />
      </G>
    </Cadre>
  );
}

/**
 * Troisième carte : bienvenue. Le trajet, du départ à l'arrivée.
 *
 * Ni prix ni bulle ici — les deux premières cartes ont dit le produit. Celle-ci
 * ne répète pas, elle accueille : deux points reliés, la course qui commence.
 */
export function AccrocheBienvenue() {
  const { couleurs } = useTheme();
  return (
    <Cadre>
      <Path
        d="M120 4 L200 24 L164 62 L214 82 L120 156 L146 88 L96 70 Z"
        fill={couleurs.accFill}
        opacity={0.9}
      />
      {/* La route : elle se lit du départ vers l'arrivée, pas l'inverse. */}
      <Path
        d="M40 150 C40 100 90 96 120 96 C150 96 200 92 200 44"
        fill="none"
        stroke={couleurs.ink}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray="12 10"
      />
      {/* Départ en `ok`, arrivée en accent : deux formes porteuses, donc
          cerclées — un aplat seul ne se distingue pas sur fond clair. */}
      <G stroke={couleurs.shapeOutline} strokeWidth={3}>
        <Circle cx={40} cy={150} r={16} fill={couleurs.ok} />
        <Circle cx={200} cy={44} r={16} fill={couleurs.accFill} />
      </G>
    </Cadre>
  );
}
