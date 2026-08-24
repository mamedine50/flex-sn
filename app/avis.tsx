import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FeuilleSignalement from '../src/components/FeuilleSignalement';
import Vide from '../src/components/Vide';
import { useI18n, useT } from '../src/i18n';
import { masquerGrossieretes } from '../src/lib/filtreMots';
import type { Database } from '../src/lib/database.types';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';
import { supabase } from '../src/lib/supabase';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Mes avis.
 *
 * Ceux qu'on a REÇUS, une fois dévoilés — les deux ont noté, ou sept jours ont
 * passé. `mes_evaluations` s'en charge côté base.
 *
 * On ne dit JAMAIS qui a écrit quoi, et l'écran l'annonce en tête. Ce n'est pas
 * une omission : un conducteur qui sait quel passager lui a mis deux étoiles,
 * c'est une représaille en puissance, et le double aveugle ne servirait à rien
 * s'il se levait à la lecture.
 */
type AvisRecu = Database['public']['Views']['mes_evaluations']['Row'];

const GABARIT = { ligne: 50 };

export default function Avis() {
  const t = useT();
  const { langue } = useI18n();
  useGardeSession('/avis');

  const marges = useSafeAreaInsets();
  const [avis, setAvis] = useState<AvisRecu[]>([]);
  // Même raison qu'ailleurs : un échec réseau doit pouvoir se retenter.
  const [tour, setTour] = useState(0);
  const [statut, setStatut] = useState<'chargement' | 'pret' | 'erreur'>('chargement');
  const [aSignaler, setASignaler] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);

  configurerGabarit('avis', GABARIT);

  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const { data, error } = await supabase
        .from('mes_evaluations')
        .select('*')
        .order('cree_le', { ascending: false })
        .limit(100);
      if (vivant.annule) return;
      if (error) {
        setStatut('erreur');
        return;
      }
      setAvis(data ?? []);
      setStatut('pret');
    })();
    return () => {
      vivant.annule = true;
    };
  }, [tour]);

  return (
    <View className="flex-1 bg-bg">
      <View
        className="flex-row items-center justify-between px-16"
        style={{ paddingTop: marges.top + 8 }}
      >
        <Text className="text-[22px] font-extrabold text-ink">{t('avis.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="min-h-touch justify-center pl-16"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      <Text className="mt-8 px-16 text-[13px] font-semibold text-muted">
        {t('avis.anonyme')}
      </Text>

      {statut === 'chargement' ? (
        <View className="mt-24 items-center">
          <ActivityIndicator />
        </View>
      ) : statut === 'erreur' ? (
        <Vide
          titre={t('avis.illisible')}
          onReessayer={() => setTour((n) => n + 1)}
          libelleReessayer={t('commun.reessayer')}
        />
      ) : avis.length === 0 ? (
        <Vide titre={t('avis.vide')} aide={t('avis.videAide')} />
      ) : (
        <FlatList
          data={avis}
          keyExtractor={(a) => a.course_id ?? ''}
          className="mt-12"
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
          renderItem={({ item, index }) => (
            <View
              className="mb-8 min-h-[50px] rounded-card bg-card p-16"
              onLayout={
                index === 0
                  ? (e) => noterMesure('ligne', e.nativeEvent.layout.height)
                  : undefined
              }
            >
              <View className="flex-row items-center justify-between">
                <Text
                  className="text-[17px] font-extrabold text-ink"
                  style={chiffresTabulaires}
                >
                  {'★'.repeat(item.note ?? 0)}
                  <Text className="text-muted">{'★'.repeat(5 - (item.note ?? 0))}</Text>
                </Text>
                <Text className="text-[12px] font-semibold text-muted">
                  {item.cree_le
                    ? new Date(item.cree_le).toLocaleDateString(
                        langue === 'en' ? 'en-GB' : 'fr-FR',
                        { day: 'numeric', month: 'short', year: 'numeric' },
                      )
                    : ''}
                </Text>
              </View>
              <Text
                className={`mt-8 text-[14px] ${
                  item.commentaire ? 'font-semibold text-ink' : 'font-semibold text-muted'
                }`}
              >
                {/* Le texte est enregistré tel quel et masqué À L'AFFICHAGE :
                    refuser à l'écriture apprend à contourner et fait disparaître
                    la preuve dont l'équipe a besoin pour traiter un
                    signalement. */}
                {item.commentaire
                  ? masquerGrossieretes(item.commentaire)
                  : t('avis.sansCommentaire')}
              </Text>

              {/* Signaler l'avis ne dit jamais QUI l'a écrit : la feuille
                  n'envoie que la course, le serveur déduit l'autre bout. Le
                  double aveugle tiendrait mal s'il fallait nommer quelqu'un
                  pour le dénoncer. */}
              {item.course_id ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setASignaler(item.course_id)}
                  className="mt-8 min-h-touch justify-center self-start"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text className="text-[13px] font-bold text-muted">
                    {t('signalement.signaler')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      {aSignaler ? (
        <FeuilleSignalement
          courseId={aSignaler}
          porteSurAvis
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

