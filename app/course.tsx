import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EtatCarte } from '../src/components/CarteFond';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import {
  annulerCourse,
  avancerCourse,
  ETAPE_SUIVANTE,
  noterCourse,
  useCourse,
  useDejaNote,
  usePositionConducteur,
  type StatutCourse,
} from '../src/lib/course';
import { cleErreur } from '../src/lib/erreursServeur';
import { formatXof } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useSession } from '../src/lib/session';
import {
  ageSecondes,
  etaMinutes,
  POSITION_PERIMEE_MS,
  useEmissionPosition,
  useMarqueurLisse,
} from '../src/lib/suivi';
import { chiffresTabulaires } from '../src/theme/typographie';

const CarteFond = lazy(() => import('../src/components/CarteFond'));

/**
 * En route.
 *
 * Le même écran pour les deux rôles : ce qui change est qui pilote et qui suit.
 * Le conducteur avance la course d'un cran ; le passager la regarde avancer.
 *
 * Le prix convenu est affiché EN PERMANENCE, quelle que soit l'étape. C'est le
 * seul chiffre sur lequel les deux se sont mis d'accord, et c'est celui qu'on
 * conteste à l'arrivée si personne ne l'a sous les yeux.
 */

const GABARIT = { prix: 72, action: 56 };

/** Au-delà, on signale au passager que la voiture ne bouge pas. */
const IMMOBILE_MIN = 3;

export default function EnRoute() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const session = useSession();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const { statut, course, resynchronise } = useCourse();
  const dejaNote = useDejaNote(course?.id ?? null);

  // Le battement de l'horloge : « immobile depuis 4 min » doit vieillir sous les
  // yeux, sinon le passager lit une durée figée et croit l'écran mort.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(Date.now()), 30000);
    return () => clearInterval(battement);
  }, []);


  const [occupe, setOccupe] = useState(false);
  const [echec, setEchec] = useState<ReturnType<typeof cleErreur> | null>(null);
  const [confirmeAnnulation, setConfirmeAnnulation] = useState(false);
  const [etatCarte, setEtatCarte] = useState<EtatCarte>('attente');
  const [note, setNote] = useState(0);

  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;
  const moi = session.statut === 'connecte' ? session.session.user.id : null;
  const suisConducteur = Boolean(moi && course && course.conducteur_id === moi);
  const autre = suisConducteur ? course?.passager : course?.conducteur;

  // Côté conducteur : on ÉMET, et seulement pendant le déplacement.
  useEmissionPosition(suisConducteur ? (course?.statut as StatutCourse) : null);

  // Côté passager : on SUIT. La position n'est servie qu'à partir de « en route ».
  const enDeplacement =
    course?.statut === 'en_route' ||
    course?.statut === 'arrive' ||
    course?.statut === 'commencee';
  const positionConducteur = usePositionConducteur(
    course?.conducteur_id ?? null,
    !suisConducteur && enDeplacement,
  );

  const marqueur = useMarqueurLisse(
    positionConducteur
      ? {
          latitude: positionConducteur.latitude,
          longitude: positionConducteur.longitude,
          cap: positionConducteur.cap,
          majLe: new Date(positionConducteur.majLe).getTime(),
        }
      : null,
  );

  const ageM = marqueur ? ageSecondes(marqueur.majLe, maintenant) : 0;
  const positionPerimee = Boolean(marqueur) && ageM * 1000 > POSITION_PERIMEE_MS;
  const minutesImmobile = Math.floor(ageM / 60);

  // L'ETA se recalcule sur la distance restante — la même estimation que le
  // bouton d'acceptation du conducteur, jamais un appel Directions.
  const cible =
    course?.statut === 'commencee'
      ? course.demande
        ? {
            latitude: course.demande.destination_lat,
            longitude: course.demande.destination_lon,
          }
        : null
      : course?.demande
        ? { latitude: course.demande.depart_lat, longitude: course.demande.depart_lon }
        : null;
  const eta = marqueur ? etaMinutes(marqueur, cible) : null;


  configurerGabarit(
    !course ? 'course' : suisConducteur ? 'course+conducteur' : 'course+passager',
    course && suisConducteur
      ? { prix: GABARIT.prix, action: GABARIT.action }
      : { prix: GABARIT.prix },
  );

  const surEtatCarte = useCallback((e: Exclude<EtatCarte, 'attente'>) => setEtatCarte(e), []);

  const avancer = useCallback(async () => {
    if (!course) return;
    const suivante = ETAPE_SUIVANTE[course.statut as StatutCourse];
    if (!suivante) return;

    setOccupe(true);
    setEchec(null);
    const { error } = await avancerCourse(course.id, suivante);
    setOccupe(false);

    if (error) {
      setEchec(cleErreur(error));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [course]);

  const annuler = useCallback(async () => {
    if (!course) return;
    setConfirmeAnnulation(false);
    setOccupe(true);
    setEchec(null);
    const { error } = await annulerCourse(course.id);
    setOccupe(false);
    if (error) {
      // Annulation croisée : l'autre a annulé pendant qu'on regardait.
      setEchec(cleErreur(error));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [course]);

  const envoyerNote = useCallback(async () => {
    if (!course || note === 0) return;
    setOccupe(true);
    const { error } = await noterCourse(course.id, note);
    setOccupe(false);
    if (error) {
      setEchec(cleErreur(error));
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  }, [course, note]);

  if (statut === 'chargement') return <Squelette />;

  if (!course) {
    return (
      <Vide texte={t('enRoute.aucuneCourse')} action={t('offres.proposerUnPrix')} />
    );
  }

  const depart = course.demande
    ? { latitude: course.demande.depart_lat, longitude: course.demande.depart_lon }
    : null;
  const arrivee = course.demande
    ? {
        latitude: course.demande.destination_lat,
        longitude: course.demande.destination_lon,
      }
    : null;

  const terminee = course.statut === 'terminee';
  const annulee = course.statut === 'annulee';
  const suivante = ETAPE_SUIVANTE[course.statut as StatutCourse];

  return (
    <View className="flex-1 bg-bg">
      <View className="absolute inset-0 bg-map" />
      {/* La carte est le fond de tout l'écran ; l'entête, qui a son propre fond,
          la masque en haut, et les cartes flottent par-dessus. */}
      {depart && !terminee && !annulee ? (
        <View className="absolute inset-0">
          <Suspense fallback={null}>
            <CarteFond
              region={{ ...depart, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
              onEtat={surEtatCarte}
            >
              <Marker coordinate={depart} anchor={{ x: 0.5, y: 0.5 }}>
                <View className="h-24 w-24 rounded-pill border-2 border-shapeOutline bg-accFill" />
              </Marker>
              {arrivee ? (
                <Marker coordinate={arrivee} anchor={{ x: 0.5, y: 0.5 }}>
                  <View className="h-24 w-24 rounded-pill border-2 border-shapeOutline bg-moneyFill" />
                </Marker>
              ) : null}
              {marqueur ? (
                <Marker
                  coordinate={{ latitude: marqueur.latitude, longitude: marqueur.longitude }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat
                  // Le cap oriente la voiture. Sans lui elle glisse de côté, ce
                  // qui se lit comme un bug avant de se lire comme une voiture.
                  rotation={marqueur.cap ?? 0}
                >
                  <View className="h-32 w-32 items-center justify-center rounded-pill border-2 border-shapeOutline bg-card">
                    <Text className="text-[15px] font-extrabold text-ink">▲</Text>
                  </View>
                </Marker>
              ) : null}
            </CarteFond>
          </Suspense>
        </View>
      ) : null}

      {/* L'entête a son propre fond : posée à même la carte, elle devenait
          illisible dès que la carte passait sous elle. */}
      <View
        className="bg-bg px-16 pb-12"
        style={{ paddingTop: marges.top + 8 }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[22px] font-extrabold text-ink">{t('enRoute.titre')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => router.replace('/')}
            onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        // `flexGrow` + `flex-end` : le contenu se colle en bas, la carte occupe
        // ce qui reste. `mt-auto` ne marche pas dans un ScrollView, dont le
        // conteneur n'a pas de hauteur imposée.
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingBottom: marges.bottom + 24,
        }}
        pointerEvents="box-none"
      >
        {horsLigne ? <Bandeau texte={t('enRoute.horsLigne')} /> : null}
        {/* Une position qui date : on le DIT, plutôt que d'afficher une voiture
            faussement immobile. Le conducteur a peut-être quitté l'application —
            la V1 ne suit pas en arrière-plan, et c'est assumé. */}
        {!suisConducteur && positionPerimee && minutesImmobile < IMMOBILE_MIN ? (
          <Bandeau texte={t('enRoute.positionDatee', { secondes: ageM })} />
        ) : null}
        {!suisConducteur && minutesImmobile >= IMMOBILE_MIN ? (
          <Bandeau texte={t('enRoute.immobile', { minutes: minutesImmobile })} />
        ) : null}
        {resynchronise ? <Bandeau texte={t('enRoute.resynchronisation')} /> : null}
        {echec ? <Bandeau texte={t(echec)} danger /> : null}
        {etatCarte === 'indisponible' && !terminee && !annulee ? (
          <Bandeau texte={t('accueil.carteIndisponible')} />
        ) : null}

        <View className="px-16">
          {/* Le prix convenu, toujours visible, à toutes les étapes. */}
          <View
            className="mt-16 rounded-card bg-card p-16"
            onLayout={(e) => noterMesure('prix', e.nativeEvent.layout.height)}
          >
            <Text className="text-[12px] font-semibold text-muted">
              {t('enRoute.prixConvenu')}
            </Text>
            <Text
              className="text-[34px] font-extrabold text-moneyInk"
              style={chiffresTabulaires}
            >
              {formatXof(course.prix_convenu_xof)}
            </Text>

            <Text className="mt-8 text-[15px] font-bold text-ink">
              {annulee
                ? course.annulee_par === moi
                  ? t('enRoute.annuleeParVous')
                  : t('enRoute.annuleePar', { prenom: autre?.prenom ?? '' })
                : terminee
                  ? t('enRoute.terminee')
                  : t(
                      `enRoute.${course.statut}${suisConducteur ? 'Conducteur' : ''}` as never,
                    )}
            </Text>

            {!suisConducteur && eta !== null && !terminee && !annulee ? (
              <Text className="mt-4 text-[13px] font-semibold text-muted">
                {course.statut === 'commencee'
                  ? t('enRoute.etaArrivee', { minutes: eta })
                  : t('enRoute.etaPriseEnCharge', { minutes: eta })}
              </Text>
            ) : null}

            {/* La PLAQUE, en gros, côté passager : c'est avec elle qu'on monte
                dans la bonne voiture. Elle n'existe nulle part avant
                l'acceptation. */}
            {!suisConducteur && course.vehicule && !terminee && !annulee ? (
              <View className="mt-12 self-start rounded-field border-2 border-shapeOutline bg-card2 px-16 py-8">
                <Text
                  className="text-[26px] font-extrabold tracking-wider text-ink"
                  style={chiffresTabulaires}
                >
                  {course.vehicule.plaque}
                </Text>
                <Text className="text-[12px] font-semibold text-muted">
                  {course.vehicule.modele} {course.vehicule.couleur}
                </Text>
              </View>
            ) : null}
          </View>

          {autre && !terminee && !annulee ? (
            <Contrepartie
              prenom={autre.prenom}
              telephone={autre.telephone}
              suisConducteur={suisConducteur}
            />
          ) : null}

          {/* Le conducteur pilote. Une seule action, celle de l'étape suivante. */}
          {suisConducteur && suivante && !annulee ? (
            <Action
              nom="action"
              texte={
                suivante === 'en_route'
                  ? t('enRoute.partir')
                  : suivante === 'arrive'
                    ? t('enRoute.signalerArrivee')
                    : suivante === 'commencee'
                      ? t('enRoute.demarrer')
                      : t('enRoute.terminer')
              }
              actif={!occupe && !horsLigne}
              onPress={() => void avancer()}
            />
          ) : null}

          {/* Annuler : tant que la course n'a pas commencé. */}
          {!terminee && !annulee && course.statut !== 'commencee' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmeAnnulation(true)}
              disabled={occupe}
              className="mt-12 min-h-touch items-center justify-center rounded-field bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[14px] font-bold text-danger">
                {t('enRoute.annuler')}
              </Text>
            </Pressable>
          ) : null}

          {/* La notation, une fois terminée. */}
          {terminee ? (
            dejaNote ? (
              <View className="mt-16 rounded-card bg-card p-16">
                <Text className="text-[15px] font-bold text-ink">
                  {t('enRoute.dejaNote')}
                </Text>
                <Text className="mt-4 text-[13px] font-semibold text-muted">
                  {t('enRoute.dejaNoteAide')}
                </Text>
              </View>
            ) : (
              <Notation
                note={note}
                onNote={setNote}
                occupe={occupe}
                onEnvoyer={() => void envoyerNote()}
              />
            )
          ) : null}
        </View>
      </ScrollView>

      <Modal visible={confirmeAnnulation} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setConfirmeAnnulation(false)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('enRoute.confirmerAnnulation')}
            </Text>
            <Text className="mt-4 text-[13px] font-semibold text-muted">
              {t('enRoute.confirmerAnnulationAide')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void annuler()}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-danger">
                {t('enRoute.annuler')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmeAnnulation(false)}
              className="mt-8 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('enRoute.garderLaCourse')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {__DEV__ ? (
        <PanneauDev
          visible={panneauOuvert}
          actuel={etatForce}
          onChoisir={(e) => {
            setEtatForce(e);
            setPanneauOuvert(false);
          }}
          onFermer={() => setPanneauOuvert(false)}
        />
      ) : null}
    </View>
  );
}

function Contrepartie({
  prenom,
  telephone,
  suisConducteur,
}: {
  prenom: string;
  telephone: string | null;
  suisConducteur: boolean;
}) {
  const t = useT();
  return (
    <View className="mt-12 flex-row items-center rounded-card bg-card p-16">
      <View className="h-48 w-48 items-center justify-center rounded-pill bg-card2">
        <Text className="text-[18px] font-extrabold text-ink">{prenom.slice(0, 1)}</Text>
      </View>
      <Text className="ml-12 flex-1 text-[15px] font-bold text-ink">{prenom}</Text>

      {/* Le numéro n'existe qu'à partir d'ici : la policy ne le sert que sur une
          course active. Sans lui, on n'affiche pas de bouton mort. */}
      {telephone ? (
        <View className="flex-row gap-8">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('enRoute.appeler')}
            onPress={() => void Linking.openURL(`tel:${telephone}`)}
            className="min-h-touch items-center justify-center rounded-field bg-accFill px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-onAcc">{t('enRoute.appeler')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('enRoute.ecrire')}
            onPress={() => void Linking.openURL(`sms:${telephone}`)}
            className="min-h-touch items-center justify-center rounded-field bg-card2 px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-accInk">{t('enRoute.ecrire')}</Text>
          </Pressable>
        </View>
      ) : null}
      {suisConducteur ? null : null}
    </View>
  );
}

function Notation({
  note,
  onNote,
  occupe,
  onEnvoyer,
}: {
  note: number;
  onNote: (n: number) => void;
  occupe: boolean;
  onEnvoyer: () => void;
}) {
  const t = useT();
  return (
    <View className="mt-16 rounded-card bg-card p-16">
      <Text className="text-[15px] font-bold text-ink">{t('enRoute.noter')}</Text>
      <Text className="mt-4 text-[13px] font-semibold text-muted">
        {t('enRoute.noterAide')}
      </Text>

      <View className="mt-12 flex-row gap-8">
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={t('enRoute.etoiles', { n })}
            accessibilityState={{ selected: note >= n }}
            onPress={() => {
              onNote(n);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            className={`min-h-driving flex-1 items-center justify-center rounded-field ${
              note >= n ? 'bg-accFill' : 'bg-card2'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className={`text-[22px] font-extrabold ${
                note >= n ? 'text-onAcc' : 'text-muted'
              }`}
            >
              ★
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={note === 0 || occupe}
        onPress={onEnvoyer}
        className={`mt-16 min-h-driving items-center justify-center rounded-button ${
          note === 0 || occupe ? 'bg-card2' : 'bg-accFill'
        }`}
        style={({ pressed }) => ({ opacity: pressed && note > 0 ? 0.7 : 1 })}
      >
        <Text
          className={`text-[16px] font-extrabold ${
            note === 0 || occupe ? 'text-muted' : 'text-onAcc'
          }`}
        >
          {t('enRoute.envoyerNote')}
        </Text>
      </Pressable>
    </View>
  );
}

function Action({
  nom,
  texte,
  actif,
  onPress,
}: {
  nom: string;
  texte: string;
  actif: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !actif }}
      disabled={!actif}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className={`mt-16 min-h-driving items-center justify-center rounded-button ${
        actif ? 'bg-accFill' : 'bg-card2'
      }`}
      style={({ pressed }) => ({ opacity: pressed && actif ? 0.7 : 1 })}
    >
      <Text className={`text-[16px] font-extrabold ${actif ? 'text-onAcc' : 'text-muted'}`}>
        {texte}
      </Text>
    </Pressable>
  );
}

function Bandeau({ texte, danger = false }: { texte: string; danger?: boolean }) {
  return (
    <View className="mx-16 mt-12 rounded-field bg-card px-16 py-12">
      <Text className={`text-[13px] font-semibold ${danger ? 'text-danger' : 'text-ink'}`}>
        {texte}
      </Text>
    </View>
  );
}

function Vide({ texte, action }: { texte: string; action: string }) {
  const marges = useSafeAreaInsets();
  return (
    <View
      className="flex-1 items-center justify-center bg-bg px-24"
      style={{ paddingTop: marges.top }}
    >
      <Text className="text-center text-[15px] font-semibold text-muted">{texte}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.replace('/')}
        className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill px-24"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Text className="text-[15px] font-extrabold text-onAcc">{action}</Text>
      </Pressable>
    </View>
  );
}

function Squelette() {
  const marges = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg px-16" style={{ paddingTop: marges.top + 16 }}>
      <View className="h-[120px] rounded-card bg-card" />
      <View className="mt-12 h-[80px] rounded-card bg-card" />
      <View className="mt-12 h-[56px] rounded-card bg-card" />
    </View>
  );
}
