import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChoixPays from '../../src/components/ChoixPays';
import { useI18n, useT } from '../../src/i18n';
import {
  cleErreurAuth,
  envoyerCode,
  numeroE164,
  numeroPlausible,
} from '../../src/lib/auth';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { drapeau, PAYS_PAR_DEFAUT, type Pays } from '../../src/lib/pays';
import { useTheme } from '../../src/theme/ThemeProvider';
import { chiffresTabulaires } from '../../src/theme/typographie';

/**
 * Connexion, premier écran : le numéro.
 *
 * L'indicatif est SÉPARÉ du numéro national et modifiable. Un champ unique
 * obligerait à taper le `+` et l'indicatif à chaque fois, et personne ne le
 * fait ; un indicatif figé à +221 exclurait tout le monde d'autre, à commencer
 * par nous en test.
 *
 * Aucune validation de plan de numérotation : on ne connaît pas ceux du monde
 * entier, et une règle trop stricte refuserait un numéro réel. On vérifie une
 * LONGUEUR plausible, le fournisseur SMS tranche.
 */

const GABARIT = { champ: 64, envoi: 56 };

export default function Connexion() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const { couleurs } = useTheme();
  const { langue } = useI18n();
  const { retour } = useLocalSearchParams<{ retour?: string }>();

  const [pays, setPays] = useState<Pays>(PAYS_PAR_DEFAUT);
  const [choixPays, setChoixPays] = useState(false);
  const [national, setNational] = useState('');

  const indicatif = pays.indicatif;
  const [envoi, setEnvoi] = useState<'repos' | 'envoi'>('repos');
  const [echec, setEchec] = useState<string | null>(null);

  configurerGabarit('connexion', GABARIT);

  const horsLigne = reseau.isInternetReachable === false;
  const possible =
    numeroPlausible(indicatif, national) && envoi === 'repos' && !horsLigne;

  const demander = async () => {
    const telephone = numeroE164(indicatif, national);
    setEnvoi('envoi');
    setEchec(null);

    const { error } = await envoyerCode(telephone);
    setEnvoi('repos');

    if (error) {
      setEchec(t(cleErreurAuth(error)));
      return;
    }

    // On passe l'indicatif et le numéro SÉPARÉMENT, pas l'E.164 : dans une
    // chaîne de requête, un « + » se décode en espace, et le numéro arrivait
    // amputé de son indicatif à l'écran suivant.
    router.push({
      pathname: '/connexion/code',
      params: { indicatif, national, retour: retour ?? '' },
    });
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1 px-16"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        {/* Le retour est TOUJOURS offert. Il ne l'était pas tant que la
            connexion était la porte d'entrée — il n'y avait nulle part où
            revenir. Depuis que l'accueil se consulte sans compte, il y a
            toujours quelque part : quelqu'un qui a ouvert cet écran par un
            geste doit pouvoir se raviser et continuer à regarder. Une garde
            posée par `replace` ne laisse pas d'historique, d'où le repli sur
            l'accueil plutôt qu'un bouton qui ne ferait rien. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center self-start"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>

        <Text className="mt-16 text-[28px] font-extrabold text-ink">
          {t('connexion.titreNumero')}
        </Text>
        <Text className="mt-8 text-[15px] font-semibold text-muted">
          {t('connexion.aideNumero')}
        </Text>

        {horsLigne ? (
          <View className="mt-16 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-semibold text-ink">
              {t('connexion.horsLigne')}
            </Text>
          </View>
        ) : null}

        {/* Drapeau et indicatif ouvrent la liste ; le numéro se tape à côté.
            Un champ d'indicatif nu obligeait à connaître le sien par cœur. */}
        <View className="mt-24 flex-row gap-12">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('connexion.choisirPays')} : ${
              langue === 'en' ? (pays.nomEn ?? pays.nom) : pays.nom
            } +${pays.indicatif}`}
            onPress={() => setChoixPays(true)}
            onLayout={(e) => noterMesure('champ', e.nativeEvent.layout.height)}
            className="h-[64px] flex-row items-center rounded-field bg-card px-12"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[22px]">{drapeau(pays.code)}</Text>
            <Text className="ml-4 text-[13px] font-bold text-muted">▾</Text>
            <Text
              className="ml-8 text-[22px] font-extrabold text-ink"
              style={chiffresTabulaires}
            >
              +{pays.indicatif}
            </Text>
          </Pressable>

          <TextInput
            value={national}
            onChangeText={(v) => setNational(v.replace(/[^0-9]/g, '').slice(0, 14))}
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoFocus
            placeholder={pays.code === 'SN' ? '77 123 45 67' : '000 000 0000'}
            placeholderTextColor={couleurs.muted}
            accessibilityLabel={t('connexion.numero')}
            className="h-[64px] flex-1 rounded-field bg-card px-12 text-[22px] font-extrabold text-ink"
            style={chiffresTabulaires}
          />
        </View>

        {echec ? (
          <Text className="mt-12 text-[13px] font-bold text-danger">{echec}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !possible, busy: envoi === 'envoi' }}
          disabled={!possible}
          onPress={() => void demander()}
          onLayout={(e) => noterMesure('envoi', e.nativeEvent.layout.height)}
          className={`mt-24 min-h-driving flex-row items-center justify-center rounded-button ${
            possible ? 'bg-accFill' : 'bg-card2'
          }`}
          style={({ pressed }) => ({ opacity: pressed && possible ? 0.7 : 1 })}
        >
          {envoi === 'envoi' ? <ActivityIndicator className="mr-8" /> : null}
          {/* Une action indisponible change de COULEUR, pas seulement
              d'opacité : un aplat clair à 50 % reste lumineux sur fond sombre. */}
          <Text
            className={`text-[16px] font-extrabold ${
              possible ? 'text-onAcc' : 'text-muted'
            }`}
          >
            {envoi === 'envoi'
              ? t('connexion.envoiEnCours')
              : t('connexion.recevoirCode')}
          </Text>
        </Pressable>
      </ScrollView>

      <ChoixPays
        visible={choixPays}
        onChoisir={(p) => {
          setPays(p);
          setChoixPays(false);
        }}
        onFermer={() => setChoixPays(false)}
      />
    </KeyboardAvoidingView>
  );
}
