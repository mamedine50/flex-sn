import { Image, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useUrlPhoto } from '../lib/photos';
import { useTheme } from '../theme/ThemeProvider';

/**
 * La voiture qui vient vous chercher.
 *
 * ELLE VIENT DE `documents_conducteur`, ET SEULEMENT VALIDÉE. La vue ne projette
 * le chemin que si l'équipe a vu la photo : personne ne regarde une image que
 * personne n'a contrôlée. Une photo en attente n'existe pas pour le passager.
 *
 * LE REPLI EST UNE SILHOUETTE, PAS UN VIDE. Un carré gris à côté d'un visage se
 * lit comme une image qui n'a pas chargé, et on attend. Une silhouette de
 * voiture dit ce qu'elle est : il n'y en a pas, et il n'y en aura pas.
 *
 * Le seau des documents est privé — l'URL est signée, comme partout ailleurs.
 */
export default function PhotoVehicule({
  chemin,
  etiquette,
}: {
  /** Le CHEMIN dans `documents-conducteur`, pas une URL. */
  chemin?: string | null;
  etiquette: string;
}) {
  const { couleurs } = useTheme();
  const uri = useUrlPhoto(chemin, 'documents-conducteur');

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={etiquette}
        resizeMode="cover"
        className="h-48 w-48 rounded-field"
      />
    );
  }

  return (
    <View
      accessibilityLabel={etiquette}
      className="h-48 w-48 items-center justify-center rounded-field bg-card2"
    >
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Path
          d="M3 15.5 L4.4 10.6 C4.7 9.5 5.7 8.8 6.8 8.8 L19.2 8.8 C20.3 8.8 21.3 9.5 21.6 10.6 L23 15.5 L23 19 L20.6 19 L20.6 17.4 L5.4 17.4 L5.4 19 L3 19 Z"
          fill="none"
          stroke={couleurs.muted}
          strokeWidth={1.7}
          strokeLinejoin="round"
        />
        <Path
          d="M7.4 13.6 h11.2"
          stroke={couleurs.muted}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
