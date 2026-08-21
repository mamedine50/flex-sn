import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUES_DISPONIBLES, useI18n, useT, type Langue } from '../src/i18n';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { PREFERENCES, useTheme, type PreferenceTheme } from '../src/theme/ThemeProvider';

/**
 * Affichage : thème et langue.
 *
 * Ils étaient posés à plat sur le Profil, six pastilles au milieu du chemin.
 * On y touche une fois dans sa vie, et ils occupaient un tiers de l'écran entre
 * ce qu'on vient chercher souvent — ses lieux — et ce qu'on vient chercher
 * ensuite. Regroupés ici, ils restent à un appui.
 */

const GABARIT = { choix: 48 };

export default function Reglages() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { preference, definirPreference } = useTheme();
  const { langue, definirLangue } = useI18n();

  configurerGabarit('reglages', GABARIT);

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
          <Text className="text-[22px] font-extrabold text-ink">{t('reglages.titre')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        <Groupe titre={t('reglages.theme')} aide={t('reglages.themeAide')}>
          <Choix
            nom="choix"
            valeurs={PREFERENCES.map((p) => ({ cle: p, libelle: t(`theme.${p}`) }))}
            actuelle={preference}
            onChoisir={(v) => definirPreference(v as PreferenceTheme)}
          />
        </Groupe>

        <Groupe titre={t('reglages.langue')} aide={t('reglages.langueAide')}>
          <Choix
            valeurs={LANGUES_DISPONIBLES.map((l) => ({
              cle: l,
              libelle: t(`langues.${l}`),
            }))}
            actuelle={langue}
            onChoisir={(v) => definirLangue(v as Langue)}
          />
        </Groupe>
      </ScrollView>
    </View>
  );
}

function Groupe({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-24">
      <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
        {titre}
      </Text>
      <Text className="mb-8 mt-4 text-[13px] font-semibold text-muted">{aide}</Text>
      {children}
    </View>
  );
}

function Choix({
  nom,
  valeurs,
  actuelle,
  onChoisir,
}: {
  nom?: string;
  valeurs: { cle: string; libelle: string }[];
  actuelle: string;
  onChoisir: (cle: string) => void;
}) {
  return (
    <View className="flex-row gap-8">
      {valeurs.map(({ cle, libelle }) => {
        const choisi = cle === actuelle;
        return (
          <Pressable
            key={cle}
            accessibilityRole="button"
            accessibilityState={{ selected: choisi }}
            onPress={() => onChoisir(cle)}
            onLayout={
              nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined
            }
            className={`min-h-touch flex-1 items-center justify-center rounded-field px-8 py-8 ${
              choisi ? 'bg-accFill' : 'bg-card'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className={`text-center text-[13px] font-bold ${
                choisi ? 'text-onAcc' : 'text-ink'
              }`}
              numberOfLines={2}
            >
              {libelle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
