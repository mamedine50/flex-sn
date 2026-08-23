import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useT } from '../i18n';
import { useNotificationsAuFocus } from '../lib/notifications';
import { Icone } from './Icones';

/**
 * La cloche, et son compte.
 *
 * ── ELLE N'APPARAÎT QUE QUAND ELLE A QUELQUE CHOSE À DIRE ──────────────────
 * Zéro non-lue, pas de cloche. Un écran d'accueil n'a pas à porter un bouton
 * permanent vers une boîte vide : chaque élément visible coûte une fraction
 * d'attention, et la carte plus le prix plus les deux services en prennent
 * déjà. Le jour où elle est là, elle veut dire quelque chose.
 *
 * On ne perd rien à la cacher : une notification non lue N'EST PAS le seul
 * chemin vers ce qu'elle annonce. L'offre est dans l'écran des offres, la
 * course dans l'écran de course. La cloche raccourcit, elle ne débloque pas.
 *
 * ── LE COMPTE S'ARRÊTE À 9 ────────────────────────────────────────────────
 * « 47 » ne se lit pas mieux que « 9+ » sur une pastille de vingt-quatre
 * points, et personne n'agit différemment à 12 qu'à 40. Au-delà, le chiffre
 * exact est du bruit qui fait grossir la pastille.
 */
export default function PastilleNotifications() {
  const t = useT();
  const boite = useNotificationsAuFocus();

  if (boite.nonLues === 0) return null;

  const compte = boite.nonLues > 9 ? '9+' : String(boite.nonLues);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('notifications.titre')}. ${compte}`}
      onPress={() => router.push('/notifications')}
      className="min-h-touch flex-row items-center rounded-field border border-line bg-card px-12"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Icone nom="cloche" />
      {/* Un aplat qui porte une information sur une surface claire reçoit son
          contour de 2 px : sans lui, l'ambre est à 1,95:1 et la forme cesse
          d'être identifiable. */}
      <View className="ml-8 min-w-24 items-center rounded-pill border-2 border-shapeOutline bg-moneyFill px-8">
        <Text className="text-[12px] font-extrabold text-onMoney">{compte}</Text>
      </View>
    </Pressable>
  );
}
