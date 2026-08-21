import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { marquerAccrocheVue } from '../src/lib/accroche';
import { basculer } from '../src/lib/monde';
import { seDeconnecter } from '../src/lib/deconnexion';
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
 *
 * `?sortir=1` fait l'inverse : il ferme la session par la MÊME séquence que le
 * bouton du profil — hors ligne d'abord, session ensuite. C'est ce qui permet
 * d'éprouver le parcours anonyme sans main humaine, et de vérifier qu'une
 * déconnexion depuis le monde conducteur en ligne ne laisse pas de fantôme.
 */
export default function SessionDev() {
  const { jeton, sortir, monde } = useLocalSearchParams<{
    jeton?: string;
    sortir?: string;
    monde?: string;
  }>();
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);

  // L'absence de jeton se DÉDUIT des props : la garder en état obligerait à
  // l'écrire depuis l'effet, c'est-à-dire un rendu de plus pour rien.
  const echec =
    jeton || sortir || monde
      ? erreurServeur
      : 'Aucun jeton. Lancez `node scripts/session-locale.mjs`.';

  useEffect(() => {
    if (!__DEV__) {
      router.replace('/');
      return;
    }
    // `?monde=conducteur` entre dans le monde conducteur sans passer par le
    // geste. Un démarrage à froid revient TOUJOURS au passager — c'est la règle,
    // et elle est juste — mais elle rend le monde conducteur inatteignable sans
    // une main. Même raison d'être que `?sortir=1` : éprouver et capturer un
    // état qu'aucun lien ne mène.
    if (monde === 'conducteur' || monde === 'passager') {
      basculer(monde);
      router.replace('/');
      return;
    }

    if (sortir === '1') {
      // Une installation dont l'utilisateur se déconnecte a forcément déjà vu le
      // tour. Sans cette marque, la sortie retomberait dessus et on ne pourrait
      // pas atteindre l'accueil anonyme, qui est justement ce qu'on éprouve.
      void marquerAccrocheVue();
      void seDeconnecter().then(({ erreur }) => {
        if (erreur) setErreurServeur('Mise hors ligne impossible : session gardée.');
      });
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
  }, [jeton, sortir, monde]);

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
