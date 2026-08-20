import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../src/i18n';
import { cleErreur } from '../../src/lib/erreursServeur';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { reprendre } from '../../src/lib/retour';
import { supabase } from '../../src/lib/supabase';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Connexion, troisième écran : le prénom.
 *
 * Demandé UNE FOIS, à la première inscription — `apresConnexion()` ne mène ici
 * que si le profil porte encore le repli `'Passager'`. Un prénom déjà réel
 * saute cet écran.
 *
 * Pourquoi ne pas le demander avant le code : on ne fait pas remplir un
 * formulaire à quelqu'un dont on ne sait pas encore s'il ira au bout.
 */

const GABARIT = { champ: 64, continuer: 56 };

export default function Prenom() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { couleurs } = useTheme();
  const { retour } = useLocalSearchParams<{ retour?: string }>();

  const [prenom, setPrenom] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  configurerGabarit('connexion-prenom', GABARIT);

  const possible = prenom.trim().length >= 2 && !envoi;

  const continuer = async () => {
    setEnvoi(true);
    setEchec(null);

    const { error } = await supabase.rpc('maj_profil', { p_prenom: prenom.trim() });
    setEnvoi(false);

    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    reprendre(retour);
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
        <Text className="mt-24 text-[28px] font-extrabold text-ink">
          {t('connexion.titrePrenom')}
        </Text>
        <Text className="mt-8 text-[15px] font-semibold text-muted">
          {t('connexion.aidePrenom')}
        </Text>

        <Text className="mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
          {t('connexion.prenom')}
        </Text>
        <TextInput
          value={prenom}
          onChangeText={(v) => setPrenom(v.slice(0, 40))}
          autoFocus
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          placeholder="Awa"
          placeholderTextColor={couleurs.muted}
          accessibilityLabel={t('connexion.prenom')}
          onLayout={(e) => noterMesure('champ', e.nativeEvent.layout.height)}
          className="mt-4 h-[64px] rounded-field bg-card px-12 text-[20px] font-bold text-ink"
        />

        {echec ? (
          <Text className="mt-12 text-[13px] font-bold text-danger">{echec}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !possible, busy: envoi }}
          disabled={!possible}
          onPress={() => void continuer()}
          onLayout={(e) => noterMesure('continuer', e.nativeEvent.layout.height)}
          className={`mt-24 min-h-driving flex-row items-center justify-center rounded-button ${
            possible ? 'bg-accFill' : 'bg-card2'
          }`}
          style={({ pressed }) => ({ opacity: pressed && possible ? 0.7 : 1 })}
        >
          {envoi ? <ActivityIndicator className="mr-8" /> : null}
          <Text
            className={`text-[16px] font-extrabold ${
              possible ? 'text-onAcc' : 'text-muted'
            }`}
          >
            {t('connexion.continuer')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
