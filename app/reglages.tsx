import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUES_DISPONIBLES, useI18n, useT, type Langue } from '../src/i18n';
import { ADRESSE_AIDE, ouvrirAide } from '../src/lib/aide';
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
  const [adresseVisible, setAdresseVisible] = useState(false);
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

        {/* CE QUI VIENT DU PROFIL. Ces trois-là s'ouvrent une fois par an et
            occupaient un tiers de la page d'accueil du compte, à hauteur de
            pouce, entre des choses qu'on touche tous les jours. Elles sont
            ici parce que c'est ici qu'on va quand on cherche un réglage. */}
        <View className="mt-24 gap-8">
          <Passage
            titre={t('profil.personnesBloquees')}
            sous={t('profil.personnesBloqueesSous')}
            onPress={() => router.push('/bloques')}
          />
          <Passage
            titre={t('profil.aide')}
            sous={t('profil.aideSous')}
            onPress={() => {
              // Sans client mail configuré, l'ouverture échoue : on montre
              // alors l'adresse en clair plutôt que de ne rien faire.
              void ouvrirAide(false).then((ouvert) => setAdresseVisible(!ouvert));
            }}
          />
          <Passage
            titre={t('profil.aPropos')}
            sous={t('profil.aProposSous')}
            onPress={() => router.push('/a-propos')}
          />
        </View>
      </ScrollView>

      {/* Aucun client mail : l'adresse s'affiche, sélectionnable. Un bouton
          « Copier » imposerait une dépendance native. */}
      <Modal visible={adresseVisible} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setAdresseVisible(false)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">{t('profil.aide')}</Text>
            <Text className="mt-8 text-[13px] font-semibold text-muted">
              {t('profil.aideAdresse')}
            </Text>
            <Text selectable className="mt-12 text-[16px] font-extrabold text-accInk">
              {ADRESSE_AIDE}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAdresseVisible(false)}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('commun.fermer')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Une ligne qui mène ailleurs. Même hauteur de pouce que partout : 48. */
function Passage({
  titre,
  sous,
  onPress,
}: {
  titre: string;
  sous: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-touch flex-row items-center rounded-card bg-card px-16 py-12"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-1 pr-12">
        <Text className="text-[15px] font-bold text-ink">{titre}</Text>
        <Text className="mt-2 text-[12px] font-semibold text-muted" numberOfLines={1}>
          {sous}
        </Text>
      </View>
      <Text className="text-[16px] font-bold text-muted">›</Text>
    </Pressable>
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
