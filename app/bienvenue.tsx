import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccrocheVotrePrix } from '../src/components/IllustrationsAccroche';
import { useT } from '../src/i18n';
import { marquerAccrocheVue } from '../src/lib/accroche';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';

/**
 * Bienvenue.
 *
 * UN écran, pas un carrousel. Un carrousel demande un geste avant d'avoir rien
 * donné, et la moitié des gens n'atteignent jamais la deuxième diapositive :
 * autant dire la moitié du message en une fois.
 *
 * Il ne s'affiche qu'au tout premier lancement, avant toute session. La marque
 * vit dans le stockage local et survit à une déconnexion — on ne réexplique pas
 * le produit à quelqu'un qui l'a déjà utilisé.
 *
 * La ligne légale n'est pas une décoration : c'est le consentement qui rend
 * l'inscription valable. Ses deux liens mènent aux pages de l'écran À propos.
 */

const GABARIT = { continuer: 56 };

export default function Bienvenue() {
  const t = useT();
  const marges = useSafeAreaInsets();

  configurerGabarit('bienvenue', GABARIT);

  const continuer = () => {
    void marquerAccrocheVue();
    router.replace('/connexion');
  };

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 24 }}>
      <Text className="text-center text-[28px] font-extrabold text-ink">Flex</Text>

      <ScrollView
        className="flex-1"
        contentContainerClassName="items-center justify-center px-24"
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <AccrocheVotrePrix />
        <Text className="mt-32 text-center text-[28px] font-extrabold text-ink">
          {t('accroche.titre')}
        </Text>
        <Text className="mt-12 text-center text-[16px] font-semibold text-muted">
          {t('accroche.sous')}
        </Text>
      </ScrollView>

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
 * La phrase légale, avec ses deux liens.
 *
 * Ils mènent aux pages internes — pas à une URL qui n'existe pas encore. Le
 * texte de ces pages est PROVISOIRE et le dit : le contenu juridique vient d'un
 * juriste, pas d'ici.
 */
function MentionLegale() {
  const t = useT();

  const morceaux = t('accroche.legal')
    .split(/(\{conditions\}|\{confidentialite\})/)
    .filter(Boolean);

  return (
    <Text className="mt-16 text-center text-[12px] font-semibold text-muted">
      {morceaux.map((m, i) => {
        if (m !== '{conditions}' && m !== '{confidentialite}') {
          return <Text key={i}>{m}</Text>;
        }
        const conditions = m === '{conditions}';
        return (
          <Text
            key={i}
            accessibilityRole="link"
            className="font-bold text-accInk underline"
            onPress={() =>
              router.push(conditions ? '/conditions' : '/confidentialite')
            }
          >
            {t(conditions ? 'accroche.conditions' : 'accroche.confidentialite')}
          </Text>
        );
      })}
    </Text>
  );
}
