import { router } from 'expo-router';
import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AccrocheOnVousRepond,
  AccrocheVotrePrix,
} from '../src/components/IllustrationsAccroche';
import { useT } from '../src/i18n';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { marquerAccrocheVue } from '../src/lib/accroche';

/**
 * L'accroche : ce que Flex fait, en deux écrans, avant qu'on demande quoi que
 * ce soit.
 *
 * Elle ne se voit qu'UNE FOIS. La revoir à chaque lancement transformerait une
 * présentation en péage. `marquerAccrocheVue()` la referme définitivement, et
 * la marque survit à une déconnexion : on ne réexplique pas le produit à
 * quelqu'un qui l'a déjà utilisé.
 *
 * Le défilement est horizontal et libre — pas de minuterie. Une accroche qui
 * avance toute seule fait rater la moitié de ce qu'elle raconte.
 */

const GABARIT = { continuer: 56 };

const PAGES = [
  { cle: 'titre1', sous: 'sous1', Image: AccrocheVotrePrix },
  { cle: 'titre2', sous: 'sous2', Image: AccrocheOnVousRepond },
] as const;

export default function Bienvenue() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);

  configurerGabarit('bienvenue', GABARIT);

  const suivre = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setPage(Math.round(x / Math.max(1, width)));
  };

  const continuer = () => {
    void marquerAccrocheVue();
    router.replace('/connexion');
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 24 }}>
      <Text className="text-center text-[28px] font-extrabold text-ink">Flex</Text>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={suivre}
        className="flex-1"
      >
        {PAGES.map(({ cle, sous, Image }) => (
          <View key={cle} className="items-center justify-center px-24" style={{ width }}>
            <Image />
            <Text className="mt-32 text-center text-[26px] font-extrabold text-ink">
              {t(`accroche.${cle}`)}
            </Text>
            <Text className="mt-12 text-center text-[16px] font-semibold text-muted">
              {t(`accroche.${sous}`)}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Les points disent où l'on en est. Ils ne se tapent pas : deux cibles de
          8 px côte à côte sont sous tout seuil raisonnable. */}
      <View
        className="mb-24 flex-row justify-center gap-8"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {PAGES.map((p, i) => (
          <View
            key={p.cle}
            className={`h-8 w-8 rounded-pill ${i === page ? 'bg-ink' : 'bg-line'}`}
          />
        ))}
      </View>

      <View className="px-16" style={{ paddingBottom: marges.bottom + 16 }}>
        <Pressable
          accessibilityRole="button"
          onPress={continuer}
          onLayout={(e) => noterMesure('continuer', e.nativeEvent.layout.height)}
          className="min-h-driving items-center justify-center rounded-button bg-accFill"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[16px] font-extrabold text-onAcc">
            {t('accroche.continuer')}
          </Text>
        </Pressable>

        <MentionLegale />
      </View>
    </View>
  );
}

/**
 * La phrase légale.
 *
 * Les deux liens ne sont cliquables QUE si les adresses existent. Afficher un
 * lien mort vers des conditions d'utilisation, c'est promettre un document
 * qu'on n'a pas — et c'est le genre de promesse qui se lit devant un juge.
 */
function MentionLegale() {
  const t = useT();
  const conditions = process.env.EXPO_PUBLIC_URL_CONDITIONS;
  const confidentialite = process.env.EXPO_PUBLIC_URL_CONFIDENTIALITE;

  const morceaux = t('accroche.legal')
    .split(/(\{conditions\}|\{confidentialite\})/)
    .filter(Boolean);

  return (
    <Text className="mt-16 text-center text-[12px] font-semibold text-muted">
      {morceaux.map((m, i) => {
        const url = m === '{conditions}' ? conditions : confidentialite;
        const cle =
          m === '{conditions}'
            ? ('accroche.conditions' as const)
            : ('accroche.confidentialite' as const);

        if (m !== '{conditions}' && m !== '{confidentialite}') {
          return <Text key={i}>{m}</Text>;
        }
        if (!url) return <Text key={i}>{t(cle)}</Text>;
        return (
          <Text
            key={i}
            accessibilityRole="link"
            className="font-bold text-accInk underline"
            onPress={() => void Linking.openURL(url)}
          >
            {t(cle)}
          </Text>
        );
      })}
    </Text>
  );
}
