import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { useT } from '../i18n';
import { communesPour, useCommunes, type Commune } from '../lib/communes';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Choisir un lieu dans la table des communes.
 *
 * C'est le seul répertoire de lieux dont on dispose : la V1 s'interdit la
 * recherche de lieu de Google, qui est facturée. Un choix de commune pointe donc
 * un centroïde, pas une adresse — c'est grossier, et c'est assumé tant qu'on n'a
 * pas les polygones réels.
 */
type Props = {
  visible: boolean;
  service: 'urbain' | 'interurbain';
  titre: string;
  onChoisir: (commune: Commune) => void;
  onFermer: () => void;
};

export default function ChoixCommune({
  visible,
  service,
  titre,
  onChoisir,
  onFermer,
}: Props) {
  const t = useT();
  const { couleurs } = useTheme();
  const etat = useCommunes();
  const [filtre, setFiltre] = useState('');

  const liste = useMemo(() => {
    const candidates = communesPour(etat.communes, service);
    const recherche = filtre.trim().toLocaleLowerCase('fr');
    if (!recherche) return candidates;
    return candidates.filter((c) => c.nom.toLocaleLowerCase('fr').includes(recherche));
  }, [etat.communes, service, filtre]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <View className="flex-1 bg-bg px-16 pt-48">
        <View className="flex-row items-center justify-between">
          <Text className="text-[20px] font-extrabold text-ink">{titre}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.fermer')}
            onPress={onFermer}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.fermer')}</Text>
          </Pressable>
        </View>

        <TextInput
          value={filtre}
          onChangeText={setFiltre}
          placeholder={t('prix.chercherCommune')}
          placeholderTextColor={couleurs.muted}
          className="mt-16 min-h-touch rounded-field bg-card2 px-16 text-[15px] font-semibold text-ink"
          autoCorrect={false}
        />

        {etat.statut === 'chargement' ? (
          <Skeletons />
        ) : (
          <FlatList
            data={liste}
            keyExtractor={(c) => c.code}
            className="mt-12"
            ListEmptyComponent={
              <Text className="mt-24 text-[14px] font-semibold text-muted">
                {etat.statut === 'erreur' ? t('erreurs.reseau') : t('prix.aucuneCommune')}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => onChoisir(item)}
                className="mb-8 min-h-touch justify-center rounded-field bg-card px-16 py-12"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text className="text-[15px] font-bold text-ink">{item.nom}</Text>
                <Text className="text-[12px] font-semibold text-muted">{item.region}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

/** Squelettes, jamais de roue qui tourne. */
function Skeletons() {
  return (
    <View className="mt-12">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View key={i} className="mb-8 h-[64px] rounded-field bg-card" />
      ))}
    </View>
  );
}
