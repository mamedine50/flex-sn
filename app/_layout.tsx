import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';
import { I18nProvider } from '../src/i18n';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

/**
 * Racine de l'application : thème, langue, zones sûres.
 *
 * Aucun écran n'est déclaré ici — ils arrivent à l'étape 3. La carte n'est pas
 * chargée à ce niveau : elle est importée par sous-chemin depuis l'accueil,
 * après le premier rendu.
 */
function Coquille() {
  const { theme, couleurs } = useTheme();

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
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
