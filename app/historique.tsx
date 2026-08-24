import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FeuilleBlocage from '../src/components/FeuilleBlocage';
import Vide from '../src/components/Vide';
import FeuilleSignalement from '../src/components/FeuilleSignalement';
import { useI18n, useT } from '../src/i18n';
import { formatXof } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';
import { useHistorique, type LigneHistorique } from '../src/lib/historique';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Mes courses.
 *
 * Le complément direct de la carte de gains : « 4 400 FCFA cette semaine »
 * appelle « lesquelles ». Et côté passager, c'est la seule trace de ce qu'on a
 * dépensé.
 *
 * On montre AUSSI les courses annulées. Les cacher donnerait un historique qui
 * ne colle pas au souvenir — et c'est précisément celles-là qu'on vient
 * vérifier.
 */

const GABARIT = { ligne: 50 };

export default function Historique() {
  const t = useT();
  const { langue } = useI18n();
  useGardeSession('/historique');

  const marges = useSafeAreaInsets();
  const { courses, statut, moi, relire } = useHistorique();
  const [aSignaler, setASignaler] = useState<string | null>(null);
  const [aBloquer, setABloquer] = useState<{ id: string; prenom: string } | null>(null);
  const [envoye, setEnvoye] = useState(false);

  configurerGabarit('historique', GABARIT);

  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(langue === 'en' ? 'en-GB' : 'fr-FR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  return (
    <View className="flex-1 bg-bg">
      <View
        className="flex-row items-center justify-between px-16"
        style={{ paddingTop: marges.top + 8 }}
      >
        <Text className="text-[22px] font-extrabold text-ink">{t('historique.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center pl-16"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {statut === 'chargement' ? (
        <View className="mt-24 items-center">
          <ActivityIndicator />
        </View>
      ) : statut === 'erreur' ? (
        <Vide
          titre={t('historique.illisible')}
          onReessayer={relire}
          libelleReessayer={t('commun.reessayer')}
        />
      ) : courses.length === 0 ? (
        <Vide titre={t('historique.vide')} aide={t('historique.videAide')} />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          className="mt-12"
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          renderItem={({ item, index }) => (
            <Ligne
              nom={index === 0 ? 'ligne' : undefined}
              course={item}
              suisConducteur={item.conducteur_id === moi}
              date={date(item.terminee_le ?? item.verrouillee_le)}
              onSignaler={() => setASignaler(item.id)}
              onBloquer={() =>
                setABloquer({
                  id: item.conducteur_id === moi ? item.passager_id : item.conducteur_id,
                  prenom: item.contrepartie_prenom ?? '',
                })
              }
            />
          )}
        />
      )}

      {/* BLOQUER VIT ICI, à côté de SIGNALER : les deux gestes d'après-course au
          même endroit. Il était sur l'écran de course, empilé sous « Annuler la
          course » dans le même rouge — deux alarmes qui se disputaient l'œil,
          pour une action qui n'agit que sur les appariements FUTURS. Voir
          `FeuilleBlocage`. */}
      {aBloquer ? (
        <FeuilleBlocage
          profilId={aBloquer.id}
          prenom={aBloquer.prenom}
          onFermer={(bloque) => {
            setABloquer(null);
            if (bloque) setEnvoye(true);
          }}
        />
      ) : null}

      {aSignaler ? (
        <FeuilleSignalement
          courseId={aSignaler}
          ouverte
          onFermer={(envoi) => {
            setASignaler(null);
            setEnvoye(envoi);
          }}
        />
      ) : null}

      {envoye ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setEnvoye(false)}
          className="absolute inset-x-16 rounded-card bg-card p-16"
          style={{ bottom: marges.bottom + 16 }}
        >
          <Text className="text-[14px] font-bold text-ink">{t('signalement.envoye')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Ligne({
  nom,
  course,
  suisConducteur,
  date,
  onSignaler,
  onBloquer,
}: {
  nom?: string;
  course: LigneHistorique;
  suisConducteur: boolean;
  date: string;
  onSignaler: () => void;
  onBloquer: () => void;
}) {
  const t = useT();
  const annulee = course.statut === 'annulee';

  return (
    <View
      className="mb-8 min-h-[50px] flex-row items-center rounded-card bg-card p-16"
      onLayout={nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined}
    >
      <View className="flex-1 pr-12">
        <Text className="text-[15px] font-bold text-ink" numberOfLines={1}>
          {course.demande?.destination_libelle ?? '—'}
        </Text>
        <Text className="mt-2 text-[12px] font-semibold text-muted" numberOfLines={1}>
          {date} ·{' '}
          {suisConducteur
            ? t('historique.commeConducteur')
            : t('historique.commePassager')}
          {annulee ? ` · ${t('historique.annulee')}` : ''}
        </Text>

        {/* Une course ANNULÉE n'a rien produit : il n'y a rien à signaler.
            Le lien ne sort donc que sur une course qui a eu lieu. */}
        {annulee ? null : (
          <View className="flex-row items-center gap-16">
            <Pressable
              accessibilityRole="button"
              onPress={onSignaler}
              className="min-h-touch justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-[12px] font-bold text-muted">
                {t('signalement.signaler')}
              </Text>
            </Pressable>
            {/* Discret et en `muted`, pas en `danger` : c'est une porte, pas
                une alarme. Le rouge est réservé au geste lui-même, dans la
                feuille de confirmation. */}
            <Pressable
              accessibilityRole="button"
              onPress={onBloquer}
              className="min-h-touch justify-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text className="text-[12px] font-bold text-muted">
                {t('blocages.bloquer')}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Un montant reste en `moneyInk` et en chiffres tabulaires, même barré :
          une course annulée n'a rien coûté, et le montant doit le dire sans
          disparaître — sinon on croit à une perte de données. */}
      <Text
        className={`text-[17px] font-extrabold ${annulee ? 'text-muted line-through' : 'text-moneyInk'}`}
        style={chiffresTabulaires}
      >
        {formatXof(course.prix_convenu_xof)}
      </Text>
    </View>
  );
}

