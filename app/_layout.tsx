import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../global.css';
import { I18nProvider } from '../src/i18n';
import { useAccrocheVue } from '../src/lib/accroche';
import { enregistrerAppareil, useAppuiPush } from '../src/lib/push';
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

/** Ce qu'on peut voir sans compte : le tour, la connexion, et les textes légaux. */
const SANS_SESSION = ['bienvenue', 'connexion', 'conditions', 'confidentialite'];

function Porte() {
  const session = useSession();
  const segments = useSegments();
  const accrocheVue = useAccrocheVue();

  const pret = session.statut !== 'chargement' && accrocheVue !== null;

  useEffect(() => {
    if (!pret) return;
    void SplashScreen.hideAsync();

    // LA PORTE RÉCLAME UN COMPTE, et c'est ce que fait toute application de
    // transport — Uber, Bolt, Yango, inDrive. On ne télécharge pas ce genre
    // d'application pour flâner : on la télécharge parce qu'on a besoin d'une
    // course maintenant. Laisser regarder d'abord vaut pour un catalogue, pas
    // pour un service qu'on utilise dans les deux minutes.
    //
    // L'ordre : le mini-tour une fois, puis le numéro. On explique le produit
    // avant de demander quoi que ce soit — mais on le demande ensuite.
    //
    // Les gardes par écran (`useGardeSession`) restent en place. Elles ne
    // servent plus à grand-chose une fois la porte fermée, et c'est très bien :
    // une protection qui ne s'appuie pas sur une seule ligne est une protection
    // qui survit à un changement de cette ligne.
    const dehors = SANS_SESSION.includes(segments[0] ?? '');
    if (session.statut === 'anonyme' && !dehors) {
      router.replace(accrocheVue ? '/connexion' : '/bienvenue');
    }
  }, [pret, session.statut, accrocheVue, segments]);

  /**
   * ── LA PERMISSION SE DEMANDE APRÈS LA CONNEXION, JAMAIS AVANT ────────────
   * Une boîte de dialogue système au premier écran, avant même de savoir ce que
   * fait le produit, se refuse par réflexe — et iOS ne repose JAMAIS la
   * question. On n'a qu'une seule occasion, on ne la dépense pas sur un
   * inconnu. Ici, la personne a donné son numéro et reçu un code : elle sait où
   * elle est.
   *
   * Silencieux par construction. Permission refusée, jeton périmé, Expo en
   * panne, téléphone sans services Google : rien de tout ça ne remonte, parce
   * qu'il n'y a rien qu'elle puisse en faire. LE PUSH EST UN BONUS, LA TABLE
   * `notifications` EST LA VÉRITÉ.
   */
  useEffect(() => {
    if (session.statut !== 'connecte') return;
    void enregistrerAppareil();
  }, [session.statut]);

  // L'appui sur une notification reçue écran verrouillé.
  useAppuiPush(
    useCallback((chemin: string) => {
      router.push(chemin as never);
    }, []),
  );

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
