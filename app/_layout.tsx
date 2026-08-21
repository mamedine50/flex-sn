import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';
import { I18nProvider } from '../src/i18n';
import { useAccrocheVue } from '../src/lib/accroche';
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

function Porte() {
  const session = useSession();
  const segments = useSegments();
  const accrocheVue = useAccrocheVue();

  const pret = session.statut !== 'chargement' && accrocheVue !== null;

  useEffect(() => {
    if (!pret) return;
    void SplashScreen.hideAsync();

    // La porte ne réclame RIEN. On regarde d'abord, on s'inscrit quand on
    // agit : l'accueil et le choix de lieu se consultent sans compte, et
    // chaque écran qui exige vraiment une session porte sa propre garde
    // (`useGardeSession`) — laquelle emporte le chemin de retour. Une porte
    // globale qui renverrait tout le monde vers la connexion rendrait ces
    // gardes inatteignables et ferait demander un numéro de téléphone à
    // quelqu'un qui vient juste d'ouvrir l'application.
    //
    // Seule exception, et elle ne demande rien non plus : le mini-tour, qu'on
    // montre une fois avant tout le reste.
    if (session.statut === 'anonyme' && !accrocheVue && segments[0] !== 'bienvenue') {
      router.replace('/bienvenue');
    }
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
