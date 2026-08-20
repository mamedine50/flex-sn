import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { supabase } from '../src/lib/supabase';

/**
 * Ouvre une session depuis un jeton de lien magique — DÉVELOPPEMENT SEULEMENT.
 *
 * Le jeton est fabriqué par `scripts/session-locale.mjs`, hors de
 * l'application, avec la clé `service_role` de la pile LOCALE. L'application,
 * elle, ne connaît que la clé anonyme : elle échange le jeton, c'est tout.
 *
 * C'est ce qui remplace `dev@flex.test`. La différence tient en une phrase :
 * l'ancienne solution embarquait un mot de passe utilisable par quiconque lisait
 * le dépôt ; celle-ci ne fonctionne que si l'on a déjà la main sur la base
 * locale.
 */
export default function SessionDev() {
  const { jeton } = useLocalSearchParams<{ jeton?: string }>();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  // L'absence de jeton se DÉDUIT des props : la garder en état obligerait à
  // l'écrire depuis l'effet, c'est-à-dire un rendu de plus pour rien.
  const echec = jeton
    ? erreurServeur
    : 'Aucun jeton. Lancez `node scripts/session-locale.mjs`.';

  useEffect(() => {
    if (!__DEV__) {
      router.replace('/');
      return;
    }
    if (!jeton) return;

    void (async () => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: jeton,
        type: 'email',
      });
      if (error) {
        setErreurServeur(error.message);
        return;
      }
      router.replace('/');
    })();
  }, [jeton]);

  // Cet écran ne passe pas par `src/i18n` : c'est de l'outillage, il ne sera
  // jamais traduit — même règle que le panneau de développement.
  return (
    <View className="flex-1 items-center justify-center bg-bg px-24">
      {echec ? (
        <Text className="text-center text-[14px] font-bold text-danger">{echec}</Text>
      ) : (
        <>
          <ActivityIndicator />
          <Text className="mt-12 text-[13px] font-semibold text-muted">
            Ouverture de la session de développement…
          </Text>
        </>
      )}
    </View>
  );
}
