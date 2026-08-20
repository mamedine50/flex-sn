import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

import { useT } from '../../src/i18n';
import {
  cleErreurAuth,
  envoyerCode,
  formaterNumero,
  numeroE164,
  verifierCode,
} from '../../src/lib/auth';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { apresConnexion } from '../../src/lib/retour';
import { chiffresTabulaires } from '../../src/theme/typographie';

/**
 * Connexion, deuxième écran : le code.
 *
 * Six cases à l'écran, mais UN SEUL champ de saisie, transparent, posé
 * par-dessus. C'est la seule façon d'obtenir à la fois :
 *   - le remplissage automatique iOS (`textContentType="oneTimeCode"`), qui ne
 *     s'applique qu'à un champ unique — sur six champs, il ne remplit que le
 *     premier ;
 *   - le collage du SMS entier, qui autrement s'écraserait dans une seule case.
 *
 * Pas de bouton « Vérifier » : à la sixième saisie, on vérifie. Un bouton de
 * plus après six chiffres, c'est un geste que personne n'a demandé.
 */

const LONGUEUR = 6;
const RENVOI_S = 30;

const GABARIT = { cases: 64, renvoi: 48 };

export default function CodeConnexion() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const { indicatif, national, retour } = useLocalSearchParams<{
    indicatif: string;
    national: string;
    retour?: string;
  }>();

  // Reconstruit ici, jamais transporté : un « + » ne survit pas à une chaîne de
  // requête, il s'y décode en espace.
  const telephone = numeroE164(indicatif ?? '', national ?? '');

  const champ = useRef<TextInput>(null);
  const [code, setCode] = useState('');
  const [etat, setEtat] = useState<'saisie' | 'verification' | 'renvoi'>('saisie');
  const [echec, setEchec] = useState<string | null>(null);
  const [attente, setAttente] = useState(RENVOI_S);

  configurerGabarit('connexion-code', GABARIT);

  const horsLigne = reseau.isInternetReachable === false;

  // Le compte à rebours du renvoi. Renvoyer trop tôt ne fait qu'épuiser le quota
  // du fournisseur, et le second SMS invalide le premier.
  useEffect(() => {
    if (attente <= 0) return undefined;
    const battement = setInterval(() => setAttente((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(battement);
  }, [attente]);

  const verifier = useCallback(
    async (saisi: string) => {
      setEtat('verification');
      setEchec(null);

      const { error } = await verifierCode(telephone, saisi);

      if (error) {
        // Les cases se vident : laisser le mauvais code affiché oblige à
        // l'effacer chiffre par chiffre avant de pouvoir réessayer.
        setCode('');
        setEtat('saisie');
        setEchec(t(cleErreurAuth(error)));
        champ.current?.focus();
        return;
      }

      await apresConnexion(retour);
    },
    [telephone, retour, t],
  );

  const saisir = (valeur: string) => {
    const chiffres = valeur.replace(/[^0-9]/g, '').slice(0, LONGUEUR);
    setCode(chiffres);
    setEchec(null);
    if (chiffres.length === LONGUEUR) void verifier(chiffres);
  };

  const renvoyer = async () => {
    setEtat('renvoi');
    setEchec(null);
    const { error } = await envoyerCode(telephone);
    setEtat('saisie');
    setAttente(RENVOI_S);
    if (error) setEchec(t(cleErreurAuth(error)));
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('connexion.modifierNumero')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center self-start"
        >
          <Text className="text-[15px] font-bold text-accInk">
            {t('connexion.modifierNumero')}
          </Text>
        </Pressable>

        <Text className="mt-16 text-[28px] font-extrabold text-ink">
          {t('connexion.titreCode')}
        </Text>
        <Text className="mt-8 text-[15px] font-semibold text-muted">
          {t('connexion.aideCode', { numero: formaterNumero(indicatif ?? '', national ?? '') })}
        </Text>

        {horsLigne ? (
          <View className="mt-16 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-semibold text-ink">
              {t('connexion.horsLigne')}
            </Text>
          </View>
        ) : null}

        {/* Les six cases sont un DESSIN ; la saisie se fait dans le champ
            transparent posé par-dessus. */}
        <Pressable
          accessibilityRole="none"
          onPress={() => champ.current?.focus()}
          className="mt-24"
        >
          <View
            className="flex-row gap-8"
            onLayout={(e) => noterMesure('cases', e.nativeEvent.layout.height)}
          >
            {Array.from({ length: LONGUEUR }, (_, i) => (
              <View
                key={i}
                className={`h-[64px] flex-1 items-center justify-center rounded-field ${
                  code.length === i ? 'bg-card2' : 'bg-card'
                }`}
              >
                <Text
                  className="text-[26px] font-extrabold text-ink"
                  style={chiffresTabulaires}
                >
                  {code[i] ?? ''}
                </Text>
              </View>
            ))}
          </View>

          <TextInput
            ref={champ}
            value={code}
            onChangeText={saisir}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
            maxLength={LONGUEUR}
            editable={etat === 'saisie'}
            accessibilityLabel={t('connexion.titreCode')}
            className="absolute inset-0 text-[26px] opacity-0"
          />
        </Pressable>

        {etat === 'verification' ? (
          <View className="mt-16 flex-row items-center">
            <ActivityIndicator />
            <Text className="ml-8 text-[13px] font-semibold text-muted">
              {t('connexion.verification')}
            </Text>
          </View>
        ) : null}

        {echec ? (
          <Text className="mt-16 text-[13px] font-bold text-danger">{echec}</Text>
        ) : null}

        <Text className="mt-16 text-[13px] font-semibold text-muted">
          {t('connexion.pasRecu')}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: attente > 0 || etat !== 'saisie' }}
          disabled={attente > 0 || etat !== 'saisie' || horsLigne}
          onPress={() => void renvoyer()}
          onLayout={(e) => noterMesure('renvoi', e.nativeEvent.layout.height)}
          className="mt-8 min-h-touch items-center justify-center rounded-field bg-card2"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text
            className={`text-[14px] font-bold ${
              attente > 0 || etat !== 'saisie' ? 'text-muted' : 'text-accInk'
            }`}
            style={attente > 0 ? chiffresTabulaires : undefined}
          >
            {etat === 'renvoi'
              ? t('connexion.envoiEnCours')
              : attente > 0
                ? t('connexion.renvoyerDans', { secondes: attente })
                : t('connexion.renvoyer')}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
