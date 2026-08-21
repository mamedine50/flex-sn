import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../../src/components/Avatar';
import { useT } from '../../src/i18n';
import { attenteDepuis, useEstAdmin, useFileDossiers } from '../../src/lib/admin';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { useGardeSession } from '../../src/lib/garde';

/**
 * La file des dossiers à valider.
 *
 * Du plus ancien au plus récent, et le délai d'attente écrit en toutes lettres.
 * « Il attend depuis 2 j » se lit autrement que « en attente » — c'est ce qui
 * met la pression dans le bon sens.
 *
 * Le filtre d'accès est en base : `dossiers_en_attente` porte son `est_admin()`
 * dans sa définition. L'écran ne fait que ne pas s'ouvrir pour rien.
 */

const GABARIT = { ligne: 50 };

export default function FileAdmin() {
  const t = useT();
  useGardeSession('/admin');

  const marges = useSafeAreaInsets();
  const admin = useEstAdmin();
  const { dossiers, statut } = useFileDossiers();

  configurerGabarit('admin', GABARIT);

  const duree = (depuis: string | null) => {
    const { unite, n } = attenteDepuis(depuis);
    return t(`admin.${unite}`, { n });
  };

  return (
    <View className="flex-1 bg-bg">
      <View
        className="flex-row items-center justify-between px-16"
        style={{ paddingTop: marges.top + 8 }}
      >
        <Text className="text-[22px] font-extrabold text-ink">{t('admin.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center pl-16"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {admin === 'chargement' || statut === 'chargement' ? (
        <View className="mt-24 items-center">
          <ActivityIndicator />
        </View>
      ) : dossiers.length === 0 || admin === 'non' || statut === 'erreur' ? (
        // Un non-admin ne voit rien de plus qu'une file vide : l'écran ne dit
        // pas « vous n'avez pas le droit », il n'a simplement rien à montrer.
        <Vide titre={t('admin.vide')} aide={t('admin.videAide')} />
      ) : (
        <FlatList
          data={dossiers}
          keyExtractor={(d) => d.profil_id ?? ''}
          className="mt-12"
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          renderItem={({ item, index }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.prenom}. ${t('admin.attendDepuis', {
                duree: duree(item.depuis),
              })}`}
              onPress={() =>
                router.push({
                  pathname: '/admin/[profil]',
                  params: { profil: item.profil_id ?? '' },
                })
              }
              onLayout={
                index === 0
                  ? (e) => noterMesure('ligne', e.nativeEvent.layout.height)
                  : undefined
              }
              className="mb-8 min-h-[50px] flex-row items-center rounded-card bg-card p-16"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Avatar prenom={item.prenom} photo={item.photo_url} />
              <View className="ml-12 flex-1">
                <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
                  {item.nom_complet ?? item.prenom}
                </Text>
                <Text className="mt-2 text-[12px] font-semibold text-danger">
                  {t('admin.attendDepuis', { duree: duree(item.depuis) })}
                </Text>
                <Text className="text-[12px] font-semibold text-muted">
                  {(item.pieces_en_attente ?? 0) === 1
                    ? t('admin.piecesRestantes', { n: item.pieces_en_attente ?? 0 })
                    : t('admin.piecesRestantesPluriel', { n: item.pieces_en_attente ?? 0 })}
                </Text>
              </View>
              <Text className="text-[15px] font-bold text-muted">›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Vide({ titre, aide }: { titre: string; aide: string }) {
  return (
    <View className="mx-16 mt-24 rounded-card bg-card p-16">
      <Text className="text-[15px] font-bold text-ink">{titre}</Text>
      <Text className="mt-4 text-[13px] font-semibold text-muted">{aide}</Text>
    </View>
  );
}
