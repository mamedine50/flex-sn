import { Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';

import { useT } from '../../src/i18n';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Les deux onglets de la V1 : là où on commande une course, et là où on règle
 * son compte. Rien d'autre — un onglet vide est une promesse qu'on ne tient pas.
 *
 * Les écrans de la négociation — prix, offres, course, conducteur — restent HORS
 * des onglets : une fois qu'on a proposé un prix, la barre d'onglets inviterait
 * à partir ailleurs au moment précis où il faut rester.
 */
export default function OngletsLayout() {
  const t = useT();
  const { couleurs } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: couleurs.accInk,
        tabBarInactiveTintColor: couleurs.muted,
        tabBarStyle: {
          backgroundColor: couleurs.card,
          borderTopColor: couleurs.line,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('onglets.accueil'),
          tabBarIcon: ({ color }) => <Glyphe signe="◈" couleur={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: t('onglets.profil'),
          tabBarIcon: ({ color }) => <Glyphe signe="◉" couleur={color} />,
        }}
      />
    </Tabs>
  );
}

/** Un glyphe sobre plutôt qu'une police d'icônes : une dépendance de moins. */
function Glyphe({ signe, couleur }: { signe: string; couleur: ColorValue }) {
  return (
    <View className="h-24 w-24 items-center justify-center">
      <Text style={{ color: couleur, fontSize: 17, fontWeight: '800' }}>{signe}</Text>
    </View>
  );
}
