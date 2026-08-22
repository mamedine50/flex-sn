import { router } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CarteLocalisation from './CarteLocalisation';
import FileDemandes from './FileDemandes';
import type { EtatCarte } from './CarteFond';
import { useT } from '../i18n';
import { useCourse } from '../lib/course';
import {
  majEnLigne,
  quitterLaLigne,
  useBattementPosition,
  useEnLigne,
} from '../lib/conducteur';
import { horsCouverture } from '../lib/couverture';
import { formatXof } from '../lib/format';
import { GAINS_VIDES, useGains } from '../lib/gains';
import { configurerGabarit, noterMesure } from '../lib/gabarit';
import { useLocalisation } from '../lib/localisation';
import { dejaVu, marquerVu } from '../lib/premiereFois';
import { chiffresTabulaires } from '../theme/typographie';

const CarteFond = lazy(() => import('./CarteFond'));

/**
 * LA MAISON DU CONDUCTEUR.
 *
 * Ce que cet écran n'a pas, et n'aura jamais : « Où allez-vous ». C'est la
 * question du passager. Un conducteur qui ouvre l'application veut savoir
 * combien il a fait aujourd'hui et comment se mettre à l'écoute — rien d'autre.
 *
 * Trois états, un seul écran :
 *
 *   HORS LIGNE   la carte, ses gains du jour, et un GO qu'on ne peut pas rater
 *   EN LIGNE     le même écran, GO devient un état, message calme
 *   DEMANDES     la feuille de l'écran conducteur remonte par-dessus
 *
 * Ce qui reste à sa place : l'émission de position ne tourne QUE pendant une
 * course. « Disponible » n'est pas « suivi » — être à l'écoute ne donne à
 * personne le droit de savoir où l'on est.
 */

const REGION_DEFAUT = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

/** Le GO se tape au volant, parfois d'une main. 96, pas 56. */
const GABARIT = { go: 96, bascule: 48 };

export default function MaisonConducteur({
  onModePassager,
}: {
  onModePassager: () => void;
}) {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { etat: etatPosition, position, demander } = useLocalisation();
  const { enLigne: enLigneBase, setEnLigne } = useEnLigne();
  const enLigne = enLigneBase === true;
  const gains = useGains(true) ?? GAINS_VIDES;

  /**
   * Le verrou anti-enchaînement.
   *
   * Une course à la fois. Tant qu'elle n'est pas terminée, la file reste
   * LISIBLE — savoir ce qui passe autour a de la valeur — mais on ne peut plus
   * s'engager. Le serveur le refuse déjà par `conducteur_indisponible` ; l'écran
   * le dit avant, plutôt que de laisser partir un appui pour rien.
   */
  const course = useCourse();
  const enCourse = course.course !== null;
  // Deux verrous, deux phrases. Une course en cours dit « après votre course » ;
  // une course terminée mais pas encore notée dit « notez votre passager ».
  // Le second est un péage de deux secondes, pas un mur — et il faut qu'on
  // sache lequel des deux nous retient.
  const aNoter = course.course?.statut === 'terminee';

  // Tant qu'il attend, son point suit sa voiture. Sans ça il resterait apparié
  // au trottoir où il a appuyé sur GO — voir useBattementPosition().
  useBattementPosition(enLigne, enCourse);

  const [monterCarte, setMonterCarte] = useState(false);
  const [etatCarte, setEtatCarte] = useState<EtatCarte>('attente');
  const [confirmeHorsLigne, setConfirmeHorsLigne] = useState(false);
  const [carteLoc, setCarteLoc] = useState(false);
  const [locDejaVue, setLocDejaVue] = useState<boolean | null>(null);
  const [occupe, setOccupe] = useState(false);
  /**
   * Le refus du SERVEUR, quand il ne coïncide pas avec ce que l'écran croyait.
   *
   * Cet écran ne s'affiche qu'à qui a la capacité — mais la capacité peut
   * tomber pendant qu'il est ouvert : un document refusé, une pièce ajoutée au
   * dossier. Le serveur refuse alors le GO, et sans ce message le bouton
   * passerait au vert sur un refus. Un bouton qui ment est pire qu'un bouton
   * qui bloque.
   */
  const [refus, setRefus] = useState<string | null>(null);

  configurerGabarit(enLigne ? 'maison+enligne' : 'maison', GABARIT);

  useEffect(() => {
    const tache = requestIdleCallback(() => setMonterCarte(true), { timeout: 500 });
    return () => cancelIdleCallback(tache);
  }, []);

  useEffect(() => {
    void dejaVu('localisation').then(setLocDejaVue);
  }, []);

  const surEtatCarte = useCallback((etat: Exclude<EtatCarte, 'attente'>) => {
    setEtatCarte(etat);
  }, []);

  /**
   * Trois raisons distinctes de ne pas pouvoir passer en ligne, et une seule
   * qui éteint le bouton.
   *
   * Position JAMAIS DEMANDÉE n'en est pas une : GO reste vif et sert alors à
   * demander la permission. Éteindre un bouton parce qu'on n'a pas encore posé
   * la question, c'est punir quelqu'un de ne pas avoir deviné.
   */
  const positionRefusee = etatPosition === 'refusee' || etatPosition === 'indisponible';
  const dehors = position !== null && horsCouverture(position);
  const empeche = positionRefusee ? 'position' : dehors ? 'zone' : null;

  const goPossible = empeche === null && !occupe;

  const basculerLigne = async () => {
    if (enLigne) {
      setConfirmeHorsLigne(true);
      return;
    }
    if (!position) {
      // Première fois : on explique avant la boîte système.
      if (locDejaVue === false) {
        setCarteLoc(true);
        return;
      }
      void demander();
      return;
    }
    setOccupe(true);
    setRefus(null);
    const { error } = await majEnLigne(position, true);
    setOccupe(false);
    if (error) {
      // On ne passe PAS au vert. L'ancien code posait `enLigne` sans regarder
      // la réponse : le bouton disait « EN LIGNE » pendant que le serveur
      // refusait, et la file restait vide sans que rien ne l'explique.
      setRefus(
        error.message.includes('dossier_incomplet')
          ? t('maison.dossierIncomplet')
          : t('maison.goEchec'),
      );
      return;
    }
    setEnLigne(true);
  };

  const passerHorsLigne = async () => {
    setConfirmeHorsLigne(false);
    setOccupe(true);
    // Sans position locale — après un redémarrage, par exemple — on relit la
    // dernière connue plutôt que d'en inventer une.
    if (position) await majEnLigne(position, false);
    else await quitterLaLigne();
    setEnLigne(false);
    setOccupe(false);
  };

  return (
    <View className="flex-1 bg-bg">
      <View className="absolute inset-0 bg-map" />

      {monterCarte && etatCarte !== 'indisponible' ? (
        <View style={StyleSheet.absoluteFill}>
          <Suspense fallback={null}>
            <CarteFond region={REGION_DEFAUT} centrerSur={position} onEtat={surEtatCarte}>
              {position ? (
                <Marker coordinate={position} anchor={{ x: 0.5, y: 0.5 }}>
                  {/* Aplat porteur d'information sur une carte : contour de 2 px
                      en shapeOutline, sinon il disparaît en plein soleil. */}
                  <View className="h-24 w-24 rounded-pill border-2 border-shapeOutline bg-accFill" />
                </Marker>
              ) : null}
            </CarteFond>
          </Suspense>
        </View>
      ) : null}

      <View
        className="flex-1"
        style={{ paddingTop: marges.top + 8 }}
        pointerEvents="box-none"
      >
        {/* Les gains du jour, en surimpression discrète. Le seul chiffre qui
            compte au volant : est-ce que ma journée vaut le coup. */}
        <View className="mx-16 flex-row items-center justify-between" pointerEvents="box-none">
          <View className="rounded-field border border-line bg-card px-12 py-8">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {t('maison.aujourdhui')}
            </Text>
            <Text
              className="text-[19px] font-extrabold text-moneyInk"
              style={chiffresTabulaires}
            >
              {formatXof(gains.jour_xof)}
            </Text>
            <Text className="text-[11px] font-semibold text-muted">
              {gains.courses_jour === 1
                ? t('maison.course', { n: gains.courses_jour })
                : t('maison.coursePluriel', { n: gains.courses_jour })}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onModePassager}
            onLayout={(e) => noterMesure('bascule', e.nativeEvent.layout.height)}
            className="min-h-touch justify-center rounded-field border border-line bg-card px-12"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-accInk">
              {t('maison.modePassager')}
            </Text>
          </Pressable>
        </View>

        {/* Le verrou doit avoir une SORTIE. Sans ce raccourci, le conducteur
            lit « notez votre passager » sans savoir où aller le faire. */}
        {enCourse ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/course')}
            className="mx-16 mt-8 min-h-touch justify-center rounded-field bg-accFill px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[14px] font-extrabold text-onAcc">
              {aNoter ? t('maison.noterAvant') : t('maison.enCourse')}
            </Text>
          </Pressable>
        ) : null}

        {refus !== null ? (
          <Bandeau texte={refus} />
        ) : empeche === 'position' ? (
          <Bandeau texte={t('maison.sansPosition')} />
        ) : empeche === 'zone' ? (
          <Bandeau texte={t('maison.horsZone')} />
        ) : null}

        {/* La feuille des demandes remonte sur la carte dès qu'on est en
            ligne. Elle ne se reconstruit pas : c'est la file de l'écran
            conducteur, déplacée. */}
        {enLigne ? (
          <View className="flex-1 pt-8" pointerEvents="box-none">
            <FileDemandes
              enLigne={enLigne}
              position={position}
              gele={occupe}
              raisonInactive={
                aNoter
                  ? t('maison.noterAvant')
                  : enCourse
                    ? t('maison.apresVotreCourse')
                    : null
              }
              basPage={marges.bottom + 8}
            />
          </View>
        ) : (
          <View className="flex-1" />
        )}

        {/* Le message, puis GO. Dans cet ordre : on lit avant d'appuyer. */}
        <View className="items-center px-24 pb-24" pointerEvents="box-none">
          {/* Un fond, parce que le texte se pose sur une carte : selon
              l'endroit, l'encre passe sur un plan d'eau ou une autoroute. */}
          <View className="mb-16 rounded-field bg-card px-16 py-8">
            <Text className="text-center text-[15px] font-bold text-ink">
              {enLigne ? t('maison.ecoute') : t('maison.invite')}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !enLigne && !goPossible, busy: occupe }}
            disabled={!enLigne && !goPossible}
            onPress={() => void basculerLigne()}
            onLayout={(e) => noterMesure('go', e.nativeEvent.layout.height)}
            className={`h-[96px] w-[96px] items-center justify-center rounded-pill border-2 border-shapeOutline ${
              enLigne ? 'bg-ok' : goPossible ? 'bg-accFill' : 'bg-card2'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
            <Text
              className={`text-center text-[17px] font-extrabold ${
                enLigne ? 'text-onOk' : goPossible ? 'text-onAcc' : 'text-muted'
              }`}
            >
              {enLigne ? t('maison.enLigne') : t('maison.go')}
            </Text>
          </Pressable>
        </View>
      </View>

      <CarteLocalisation
        visible={carteLoc}
        onAutoriser={() => {
          setCarteLoc(false);
          void marquerVu('localisation');
          setLocDejaVue(true);
          void demander();
        }}
        onPlusTard={() => {
          setCarteLoc(false);
          void marquerVu('localisation');
          setLocDejaVue(true);
        }}
      />

      <Modal visible={confirmeHorsLigne} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setConfirmeHorsLigne(false)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('maison.confirmerHorsLigne')}
            </Text>
            <Text className="mt-8 text-[13px] font-semibold text-muted">
              {t('maison.confirmerHorsLigneAide')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void passerHorsLigne()}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-danger">
                {t('maison.passerHorsLigne')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmeHorsLigne(false)}
              className="mt-8 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('maison.resterEnLigne')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Bandeau({ texte }: { texte: string }) {
  return (
    <View className="mx-16 mt-8 rounded-field bg-card px-16 py-12">
      <Text className="text-[13px] font-semibold text-ink">{texte}</Text>
    </View>
  );
}
