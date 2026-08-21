import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../src/i18n';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { ouvrirDocument } from '../src/lib/legal';

/**
 * À propos.
 *
 * Cet écran n'est pas une politesse : l'attribution OpenStreetMap est une
 * OBLIGATION de la licence ODbL, et la table `lieux` en vient tout entière —
 * 1 498 quartiers, arrêts et repères. Sans cet écran, on publie une application
 * qui viole la licence des données qu'elle sert.
 *
 * Le fond de carte, lui, vient de la plateforme (Google ou Apple) et porte sa
 * propre mention, rendue par le composant natif. On ne la recopie pas ici : deux
 * attributions pour la même chose, dont une qu'on tiendrait à la main, c'est
 * celle qu'on tient à la main qui finit fausse.
 */

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

const GABARIT = { retour: 48, lien: 48 };

export default function APropos() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '—';

  configurerGabarit('a-propos', GABARIT);

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
          <Text className="text-[22px] font-extrabold text-ink">
            {t('aPropos.titre')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            onLayout={(e) => noterMesure('retour', e.nativeEvent.layout.height)}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">
              {t('commun.retour')}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-8 text-[14px] font-semibold text-muted">
          {t('aPropos.version', { version })}
        </Text>

        <Text className="mb-8 mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
          {t('aPropos.cartes')}
        </Text>

        <View className="rounded-card bg-card p-16">
          <Text className="text-[15px] font-bold text-ink">
            {t('aPropos.osmAttribution')}
          </Text>
          <Text className="mt-8 text-[13px] font-semibold text-muted">
            {t('aPropos.osmLicence')}
          </Text>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('aPropos.osmLien')}
            onPress={() => void Linking.openURL(OSM_COPYRIGHT)}
            onLayout={(e) => noterMesure('lien', e.nativeEvent.layout.height)}
            className="mt-12 min-h-touch justify-center rounded-field bg-card2 px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[14px] font-bold text-accInk">
              {t('aPropos.osmLien')}
            </Text>
          </Pressable>
        </View>

        <View className="mt-12 rounded-card bg-card p-16">
          <Text className="text-[13px] font-semibold text-muted">
            {t('aPropos.fondCarte')}
          </Text>
        </View>

        <Text className="mb-8 mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
          {t('aPropos.documents')}
        </Text>

        <Lien
          titre={t('legal.conditionsTitre')}
          onPress={() => ouvrirDocument('conditions')}
        />
        <Lien
          titre={t('legal.confidentialiteTitre')}
          onPress={() => ouvrirDocument('confidentialite')}
        />
      </ScrollView>
    </View>
  );
}

function Lien({ titre, onPress }: { titre: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mb-8 min-h-[50px] flex-row items-center justify-between rounded-card bg-card px-16"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text className="flex-1 text-[15px] font-bold text-ink">{titre}</Text>
      <Text className="text-[15px] font-bold text-muted">›</Text>
    </Pressable>
  );
}
