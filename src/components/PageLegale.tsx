import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT, type CleTraduction } from '../i18n';

/**
 * La forme commune aux conditions d'utilisation et à la politique de
 * confidentialité.
 *
 * Le contenu est une TRAME, et l'écran le dit en premier, en `danger`. Le texte
 * juridique vient d'un juriste : en écrire un qui ait l'air fini serait le
 * pire des deux mondes — personne ne le remplacerait, et il ne protégerait
 * rien.
 *
 * Ce qui n'est PAS provisoire, c'est le dernier bloc : il décrit ce que
 * l'application fait déjà, et c'est vérifié par les tests.
 */
export default function PageLegale({
  titre,
  intro,
  sections,
}: {
  titre: CleTraduction;
  intro: CleTraduction;
  /** Une chaîne, séparée par des barres verticales : une seule clé à traduire. */
  sections: CleTraduction;
}) {
  const t = useT();
  const marges = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1 px-16"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-[22px] font-extrabold text-ink">{t(titre)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        {/* En premier, et en danger : personne ne doit prendre ce texte pour
            un engagement. */}
        <View className="mt-16 rounded-card bg-card p-16">
          <Text className="text-[15px] font-extrabold text-danger">
            {t('legal.provisoire')}
          </Text>
          <Text className="mt-8 text-[13px] font-semibold text-muted">
            {t('legal.provisoireAide')}
          </Text>
        </View>

        <Text className="mt-24 text-[15px] font-bold text-ink">{t(intro)}</Text>

        {t(sections)
          .split('|')
          .map((titreSection, i) => (
            <View key={titreSection} className="mt-16 rounded-card bg-card p-16">
              <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
                {i + 1}
              </Text>
              <Text className="mt-4 text-[15px] font-bold text-ink">{titreSection}</Text>
              <Text className="mt-8 text-[13px] font-semibold text-muted">
                {t('legal.provisoire')}
              </Text>
            </View>
          ))}

        <Text className="mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
          {t('legal.dejaVrai')}
        </Text>
        <View className="mt-8 rounded-card bg-card p-16">
          <Text className="text-[13px] font-semibold text-ink">
            {t('legal.dejaVraiTexte')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
