import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import { useI18n, useT } from '../src/i18n';
import { debloquer, useBlocages, type Blocage } from '../src/lib/blocages';
import { cleErreur } from '../src/lib/erreursServeur';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';

/**
 * Les personnes bloquées.
 *
 * Uniquement celles qu'on a bloquées soi-même. Cette liste ne dit jamais qui
 * nous a bloqués — l'apprendre ne sert qu'à se venger, et le blocage existe
 * précisément pour éviter ça.
 */

const GABARIT = { ligne: 50 };

export default function Bloques() {
  const t = useT();
  const { langue } = useI18n();
  useGardeSession('/bloques');

  const marges = useSafeAreaInsets();
  const { blocages, statut, relire } = useBlocages();
  const [aDebloquer, setADebloquer] = useState<Blocage | null>(null);
  const [echec, setEchec] = useState<string | null>(null);

  configurerGabarit('bloques', GABARIT);

  const retirer = async () => {
    if (!aDebloquer?.profil_id) return;
    const { error } = await debloquer(aDebloquer.profil_id);
    setADebloquer(null);
    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    relire();
  };

  return (
    <View className="flex-1 bg-bg">
      <View
        className="flex-row items-center justify-between px-16"
        style={{ paddingTop: marges.top + 8 }}
      >
        <Text className="text-[22px] font-extrabold text-ink">{t('blocages.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center pl-16"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {echec ? (
        <View className="mx-16 mt-12 rounded-field bg-card px-16 py-12">
          <Text className="text-[13px] font-bold text-danger">{echec}</Text>
        </View>
      ) : null}

      {statut === 'chargement' ? (
        <View className="mt-24 items-center">
          <ActivityIndicator />
        </View>
      ) : statut === 'erreur' ? (
        <Vide titre={t('blocages.illisible')} />
      ) : blocages.length === 0 ? (
        <Vide titre={t('blocages.vide')} aide={t('blocages.videAide')} />
      ) : (
        <FlatList
          data={blocages}
          keyExtractor={(b) => b.profil_id ?? ''}
          className="mt-12"
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          renderItem={({ item, index }) => (
            <View
              className="mb-8 min-h-[50px] flex-row items-center rounded-card bg-card p-16"
              onLayout={
                index === 0
                  ? (e) => noterMesure('ligne', e.nativeEvent.layout.height)
                  : undefined
              }
            >
              <Avatar prenom={item.prenom} photo={item.photo_url} />
              <View className="ml-12 flex-1">
                <Text className="text-[15px] font-bold text-ink">{item.prenom}</Text>
                <Text className="text-[12px] font-semibold text-muted" numberOfLines={1}>
                  {item.motif ??
                    t('blocages.depuis', {
                      date: item.cree_le
                        ? new Date(item.cree_le).toLocaleDateString(
                            langue === 'en' ? 'en-GB' : 'fr-FR',
                            { day: 'numeric', month: 'short', year: 'numeric' },
                          )
                        : '',
                    })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('blocages.debloquer')} ${item.prenom}`}
                onPress={() => setADebloquer(item)}
                className="min-h-touch justify-center pl-12"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text className="text-[14px] font-bold text-accInk">
                  {t('blocages.debloquer')}
                </Text>
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={aDebloquer !== null} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setADebloquer(null)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('blocages.debloquer')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retirer()}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('blocages.debloquer')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setADebloquer(null)}
              className="mt-8 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-accInk">
                {t('commun.annuler')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Vide({ titre, aide }: { titre: string; aide?: string }) {
  return (
    <View className="mx-16 mt-24 rounded-card bg-card p-16">
      <Text className="text-[15px] font-bold text-ink">{titre}</Text>
      {aide ? (
        <Text className="mt-4 text-[13px] font-semibold text-muted">{aide}</Text>
      ) : null}
    </View>
  );
}
