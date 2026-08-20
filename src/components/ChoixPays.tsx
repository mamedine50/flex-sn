import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n, useT } from '../i18n';
import { drapeau, PAYS, type Pays } from '../lib/pays';
import { normaliser } from '../lib/recherche';
import { useTheme } from '../theme/ThemeProvider';
import { chiffresTabulaires } from '../theme/typographie';

/**
 * Le sélecteur de pays de l'écran de connexion.
 *
 * Recherche par NOM ou par INDICATIF, sans accents ni casse : quelqu'un qui
 * connaît son « +221 » ne devrait pas avoir à savoir écrire « Sénégal ».
 * `normaliser()` est celui de la recherche de lieux — une seule règle de
 * comparaison dans toute l'application.
 */
export default function ChoixPays({
  visible,
  onChoisir,
  onFermer,
}: {
  visible: boolean;
  onChoisir: (pays: Pays) => void;
  onFermer: () => void;
}) {
  const t = useT();
  const { langue } = useI18n();
  const marges = useSafeAreaInsets();
  const { couleurs } = useTheme();
  const [recherche, setRecherche] = useState('');

  const nomDe = (p: Pays) => (langue === 'en' ? (p.nomEn ?? p.nom) : p.nom);

  const resultats = useMemo(() => {
    const q = normaliser(recherche);
    if (!q) return PAYS;
    return PAYS.filter(
      (p) => normaliser(nomDe(p)).includes(q) || p.indicatif.startsWith(q.replace(/\D/g, '')),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, langue]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 8 }}>
        <View className="flex-row items-center justify-between px-16">
          <Text className="text-[20px] font-extrabold text-ink">
            {t('connexion.choisirPays')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onFermer}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.fermer')}</Text>
          </Pressable>
        </View>

        <TextInput
          value={recherche}
          onChangeText={setRecherche}
          autoFocus
          autoCorrect={false}
          placeholder={t('connexion.chercherPays')}
          placeholderTextColor={couleurs.muted}
          accessibilityLabel={t('connexion.chercherPays')}
          className="mx-16 mt-12 min-h-touch rounded-field bg-card px-12 text-[16px] font-bold text-ink"
        />

        <FlatList
          data={resultats}
          keyExtractor={(p) => p.code}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-16 pt-12"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          ListEmptyComponent={
            <Text className="mt-24 text-center text-[14px] font-semibold text-muted">
              {t('connexion.aucunPays')}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${nomDe(item)} +${item.indicatif}`}
              onPress={() => onChoisir(item)}
              className="min-h-touch flex-row items-center border-b border-line"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[24px]">{drapeau(item.code)}</Text>
              <Text className="ml-12 flex-1 text-[16px] font-bold text-ink">
                {nomDe(item)}
              </Text>
              <Text
                className="text-[16px] font-bold text-muted"
                style={chiffresTabulaires}
              >
                +{item.indicatif}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
