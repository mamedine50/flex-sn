import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import Vide from '../src/components/Vide';
import { useT } from '../src/i18n';
import { cheminNotification } from '../src/lib/cheminNotification';
import { formatXof } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';
import {
  marquerLues,
  useNotificationsAuFocus,
  type Notification,
} from '../src/lib/notifications';
import { useProfilPublic } from '../src/lib/profilPublic';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * La boîte de notifications.
 *
 * ── LA PHRASE S'ÉCRIT ICI, PAS EN BASE ─────────────────────────────────────
 * Le serveur ne dépose qu'un genre, des identifiants et un montant. Trois
 * raisons, et chacune suffirait : l'interface est en trois langues et une
 * phrase écrite en base est figée dans celle de l'écriture ; un prénom recopié
 * sortirait du champ des vues publiques et y resterait même si la règle
 * change ; un montant se formate ici — espace insécable, FCFA suffixé, chiffres
 * tabulaires.
 *
 * ── UNE NOTIFICATION EST UN POINTEUR ───────────────────────────────────────
 * En l'ouvrant, on va sur l'écran concerné, qui RELIT l'état courant. Si
 * l'offre a expiré entre-temps, on voit la vérité et non le souvenir.
 */
const GABARIT = { entete: 40, ligne: 56 };

export default function Notifications() {
  const t = useT();
  const marges = useSafeAreaInsets();
  useGardeSession('/notifications');

  const boite = useNotificationsAuFocus();

  configurerGabarit(boite.notifications.length > 0 ? 'notifications+liste' : 'notifications', {
    entete: GABARIT.entete,
    ...(boite.notifications.length > 0 ? { ligne: GABARIT.ligne } : {}),
  });

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top }}>
      <View
        onLayout={(e) => noterMesure('entete', e.nativeEvent.layout.height)}
        className="flex-row items-center justify-between px-16 py-12"
      >
        <Text className="text-[22px] font-extrabold text-ink">
          {t('notifications.titre')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center pl-16"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {/* Vider la pastille est un GESTE, pas un effet de bord de l'ouverture.
          Marquer tout lu à l'arrivée effacerait ce que la personne vient
          d'ouvrir l'écran pour trouver. */}
      {boite.nonLues > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void marquerLues().then(() => boite.relire())}
          className="mx-16 mb-8 min-h-touch justify-center rounded-field bg-card px-16"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[13px] font-bold text-accInk">{t('notifications.toutLu')}</Text>
        </Pressable>
      ) : null}

      {boite.statut === 'chargement' ? (
        <View className="mt-24 items-center">
          <ActivityIndicator />
        </View>
      ) : boite.statut === 'erreur' ? (
        <Vide
          titre={t('notifications.illisible')}
          onReessayer={boite.relire}
          libelleReessayer={t('commun.reessayer')}
        />
      ) : boite.notifications.length === 0 ? (
        <Vide titre={t('notifications.vide')} aide={t('notifications.videAide')} />
      ) : (
        <FlatList
          data={boite.notifications}
          keyExtractor={(n) => n.id}
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          renderItem={({ item, index }) => (
            <Ligne nom={index === 0 ? 'ligne' : undefined} notification={item} />
          )}
        />
      )}
    </View>
  );
}

function Ligne({ notification, nom }: { notification: Notification; nom?: string }) {
  const t = useT();
  const acteur = useProfilPublic(notification.acteur_id);
  const vers = cheminNotification(notification.genre);

  const prenom = acteur?.prenom ?? t('notifications.quelquun');
  const montant =
    notification.montant_xof !== null ? formatXof(notification.montant_xof) : '';

  const texte = t(`notifications.${notification.genre}` as never, { prenom, montant });

  const contenu = (
    <View
      onLayout={nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined}
      className={`mb-8 min-h-touch flex-row items-center rounded-card p-16 ${
        notification.lu_le === null ? 'bg-card' : 'bg-card2'
      }`}
    >
      <Avatar prenom={acteur?.prenom ?? null} photo={acteur?.photo_url} />
      <View className="ml-12 flex-1">
        {/* Une non-lue est en GRAS, pas seulement d'une autre couleur : la
            graisse se voit du coin de l'œil, une nuance de fond non. */}
        <Text
          className={`text-[14px] text-ink ${
            notification.lu_le === null ? 'font-extrabold' : 'font-semibold'
          }`}
          style={montant ? chiffresTabulaires : undefined}
        >
          {texte}
        </Text>
      </View>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={texte}
      onPress={() => router.push(vers as never)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {contenu}
    </Pressable>
  );
}

