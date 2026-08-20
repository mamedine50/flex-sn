import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';
import { I18nProvider } from '../src/i18n';
import { accrocheDejaVue } from '../src/lib/accroche';
import { useSession } from '../src/lib/session';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

/**
 * Racine de l'application : thème, langue, zones sûres, et la PORTE.
 *
 * On ne montre rien avant de savoir qui entre. L'écran de démarrage reste donc
 * affiché tant que la session et la marque d'accroche ne sont pas lues —
 * sinon l'accueil apparaît une fraction de seconde avant d'être remplacé par la
 * connexion, et ce clignotement se lit comme un bogue.
 */
void SplashScreen.preventAutoHideAsync();

/** Les chemins qu'on a le droit de voir sans session. */
const SANS_SESSION = ['bienvenue', 'connexion'];

function Porte() {
  const session = useSession();
  const segments = useSegments();
  const [accrocheVue, setAccrocheVue] = useState<boolean | null>(null);

  useEffect(() => {
    void accrocheDejaVue().then(setAccrocheVue);
  }, []);

  const pret = session.statut !== 'chargement' && accrocheVue !== null;

  useEffect(() => {
    if (!pret) return;
    void SplashScreen.hideAsync();

    const dehors = SANS_SESSION.includes(segments[0] ?? '');
    if (session.statut === 'anonyme' && !dehors) {
      // L'accroche d'abord si elle n'a jamais été vue : on explique ce qu'est
      // Flex avant de demander un numéro de téléphone.
      router.replace(accrocheVue ? '/connexion' : '/bienvenue');
      return;
    }
    // Une session qui s'ouvre pendant qu'on est sur la connexion : les écrans
    // de connexion s'en chargent eux-mêmes et savent où revenir. On ne double
    // pas leur redirection ici, elle écraserait le chemin de retour.
  }, [pret, session.statut, accrocheVue, segments]);

  return null;
}

function Coquille() {
  const { theme, couleurs } = useTheme();

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Porte />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: couleurs.bg },
          // 180 ms : la limite au-delà de laquelle une transition se remarque.
          animationDuration: 180,
        }}
      />
    </>
  );
}

export default function RacineLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <Coquille />
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
