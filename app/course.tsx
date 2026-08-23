import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EtatCarte } from '../src/components/CarteFond';
import Avatar from '../src/components/Avatar';
import FilMessages from '../src/components/FilMessages';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import GlisserPourConfirmer from '../src/components/GlisserPourConfirmer';
import { useT } from '../src/i18n';
import { useTheme } from '../src/theme/ThemeProvider';
import {
  annulerCourse,
  avancerCourse,
  ETAPE_SUIVANTE,
  noterCourse,
  PUCES,
  useCourse,
  useDejaNote,
  usePositionConducteur,
  type StatutCourse,
} from '../src/lib/course';
import { cleErreur } from '../src/lib/erreursServeur';
import { formatXof } from '../src/lib/format';
import { useGardeSession } from '../src/lib/garde';
import { estArrive } from '../src/lib/geo';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useLocalisation } from '../src/lib/localisation';
import { ouvrirItineraire } from '../src/lib/navigation';
import { useProfilPublic } from '../src/lib/profilPublic';
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

/**
 * 56 pour l'action : c'est la taille au volant. La piste à GLISSER fait 64 —
 * elle dépasse, et c'est voulu : un geste demande plus de place qu'un appui.
 *
 * Les variantes existaient déjà, et c'est ce qui rend l'assertion capable
 * d'échouer : `action` n'apparaît que pour le conducteur, qui pilote.
 */
const GABARIT = { prix: 72, action: 56 };

/** Au-delà, on signale au passager que la voiture ne bouge pas. */
const IMMOBILE_MIN = 3;

export default function EnRoute() {
  const t = useT();
  // Cet écran écrit : sans session, il n'a rien à montrer. La garde
  // emporte le chemin, et la connexion y revient.
  useGardeSession('/course');
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
  const [filOuvert, setFilOuvert] = useState(false);
  const [note, setNote] = useState(0);
  const [puces, setPuces] = useState<string[]>([]);

  const basculerPuce = useCallback((cle: string) => {
    setPuces((liste) =>
      liste.includes(cle) ? liste.filter((c) => c !== cle) : [...liste, cle],
    );
  }, []);

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

  // ── LE CONDUCTEUR SE LOCALISE LUI-MÊME ────────────────────────────────────
  // Pour LUI, la position part de son appareil, pas de la ligne qu'il vient
  // d'écrire en base : c'est la même donnée avec un aller-retour réseau en
  // moins, et « vous y êtes » ne doit pas attendre un battement de trente
  // secondes pour s'afficher. Le passager, lui, n'a que la base — c'est tout
  // l'objet de `usePositionConducteur`.
  const { couleurs } = useTheme();
  const { position: maPosition } = useLocalisation();

  // Le nom du point où l'on va — celui que l'application de cartes affichera.
  const cibleLibelle =
    course?.statut === 'commencee'
      ? (course.demande?.destination_libelle ?? null)
      : (course?.demande?.depart_libelle ?? null);
  const jySuis = suisConducteur && course?.statut === 'en_route' && estArrive(maPosition, cible);


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
    const { error } = await noterCourse(course.id, note, puces);
    setOccupe(false);
    if (error) {
      setEchec(cleErreur(error));
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  }, [course, note, puces]);

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

              {/* ── LE TRAIT EST POINTILLÉ, ET C'EST DÉLIBÉRÉ ──
                  C'est une ligne À VOL D'OISEAU, pas une route : le vrai tracé
                  demanderait l'API Directions, facturée à l'appel et interdite
                  ici. Un trait PLEIN se lirait comme un itinéraire et enverrait
                  quelqu'un tout droit dans une corniche. Pointillé, il dit ce
                  qu'il est — une direction et une distance. Le guidage réel se
                  prend dans Plans ou Google Maps, par le bouton « Y aller ». */}
              {marqueur && cible ? (
                <Polyline
                  coordinates={[
                    { latitude: marqueur.latitude, longitude: marqueur.longitude },
                    cible,
                  ]}
                  strokeColor={couleurs.accFill}
                  strokeWidth={3}
                  lineDashPattern={[8, 8]}
                />
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
          {/* LE TITRE SUIT L'ÉTAT. Il disait « En route » sur une course
              TERMINÉE, sous un écran de notation : le seul mot de l'écran qui
              résume où l'on en est disait le contraire du reste. Un en-tête qui
              ment coûte plus cher qu'un en-tête absent — on le lit en premier
              et on lui fait confiance. */}
          <Text className="text-[22px] font-extrabold text-ink">
            {annulee
              ? t('enRoute.titreAnnulee')
              : terminee
                ? t('enRoute.titreTerminee')
                : t('enRoute.titre')}
          </Text>
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

            {/* LE CASH EST ASSUMÉ, DONC IL EST ÉCRIT. Un prix sans mode de
                règlement laisse croire à un prélèvement : le passager attend un
                débit qui ne vient pas, le conducteur attend un virement qui ne
                viendra pas non plus. Et le « 0 % » n'est pas un argument de
                vente ici — c'est la réponse à la question que le conducteur se
                pose en tendant la main : combien on me retient sur ce billet. */}
            {!annulee ? (
              <View className="mt-4 flex-row flex-wrap items-center gap-8">
                <Text className="text-[13px] font-semibold text-muted">
                  {suisConducteur
                    ? t('enRoute.aEncaisserEspeces')
                    : t('enRoute.aReglerEspeces')}
                </Text>
                {suisConducteur ? (
                  <View className="rounded-full bg-card2 px-8 py-4">
                    <Text className="text-[11px] font-extrabold text-ok">
                      {t('enRoute.zeroCommission')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

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
              id={autre.id}
              prenom={autre.prenom}
              photo={autre.photo_url}
              telephone={autre.telephone}
              suisConducteur={suisConducteur}
              onEcrire={() => setFilOuvert(true)}
            />
          ) : null}

          {/* ── Y ALLER : ON PASSE LA MAIN ──────────────────────────────────
              Le guidage réel se prend dans Plans ou Google Maps. Le conducteur
              y gagne la voix, le trafic, les radars — tout ce qu'on ne
              construira jamais, et qu'un tracé maison payé à l'appel ferait
              moins bien. Flex n'a aucune valeur à ajouter entre un conducteur
              et une route qu'il connaît mieux que nous.

              La CIBLE suit la course : le point de rendez-vous tant qu'on va
              chercher, la destination une fois le passager à bord. */}
          {suisConducteur && cible && !terminee && !annulee ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('enRoute.yAller')}
              onPress={() => void ouvrirItineraire(cible, cibleLibelle)}
              className="mt-12 min-h-driving items-center justify-center rounded-field bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-accInk">
                {t('enRoute.yAller')}
              </Text>
            </Pressable>
          ) : null}

          {/* ── « VOUS Y ÊTES » ─────────────────────────────────────────────
              Le bandeau MET EN AVANT le bouton, il ne l'appuie pas. Laisser le
              GPS avancer la course tout seul, ce serait faire démarrer une
              attente payante sur un point qui a sauté d'un immeuble — et c'est
              le genre d'automatisme qu'on ne peut pas contester après coup. */}
          {jySuis ? (
            <View className="mt-12 rounded-field border-2 border-shapeOutline bg-accFill px-16 py-12">
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('enRoute.vousYEtes')}
              </Text>
              <Text className="mt-2 text-[12px] font-semibold text-onAcc">
                {t('enRoute.vousYEtesAide')}
              </Text>
            </View>
          ) : null}

          {/* LE CONDUCTEUR PILOTE, ET DEUX DE SES GESTES SE GLISSENT.
              Démarrer et terminer décident de l'argent : une course démarrée
              trop tôt fait payer une attente, une course terminée trop tôt coupe
              le suivi en pleine route. Ces deux-là ne doivent pas pouvoir se
              faire dans une poche, ni d'un doigt qui frôle un téléphone posé sur
              un tableau de bord.

              Partir et signaler son arrivée restent des appuis : ils
              n'engagent rien qu'on ne puisse reprendre. */}
          {suisConducteur && suivante && !annulee ? (
            suivante === 'commencee' || suivante === 'terminee' ? (
              <View className="mt-12">
                <GlisserPourConfirmer
                  // UN GESTE DIFFÉRENT EST UN CONTRÔLE DIFFÉRENT. Sans cette
                  // clé, React réutilise la même instance pour « Démarrer »
                  // puis « Terminer » — même type, même position — et l'état
                  // animé survit : le conducteur trouvait une piste
                  // « Terminer la course » déjà pleine, pastille collée à
                  // droite, sans nulle part où aller. La course ne se terminait
                  // jamais.
                  key={suivante}
                  nom="action"
                  texte={
                    suivante === 'commencee'
                      ? t('enRoute.glisserDemarrer')
                      : t('enRoute.glisserTerminer')
                  }
                  occupe={occupe}
                  raisonInactive={horsLigne ? t('enRoute.horsLigne') : null}
                  onConfirmer={() => void avancer()}
                />
              </View>
            ) : (
              <Action
                nom="action"
                texte={
                  suivante === 'en_route'
                    ? t('enRoute.partir')
                    : t('enRoute.signalerArrivee')
                }
                actif={!occupe && !horsLigne}
                onPress={() => void avancer()}
              />
            )
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

          {/* ── L'HISTORIQUE RESTE ATTEIGNABLE ──
              La course finie, `Contrepartie` disparaît — et avec elle le seul
              bouton qui ouvrait le fil. Or c'est APRÈS coup qu'on signale, et
              un signalement sans ses preuves ne vaut rien. Cette ligne rouvre
              la conversation en lecture seule ; le serveur refuse l'envoi de
              toute façon, mais on ne compte pas là-dessus pour l'écran. */}
          {(terminee || annulee) && autre ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('fil.voirConversation')}
              onPress={() => setFilOuvert(true)}
              className="mt-12 min-h-touch justify-center rounded-field bg-card px-16"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[13px] font-bold text-accInk">
                {t('fil.voirConversation')}
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
                puces={puces}
                onPuce={basculerPuce}
                pourConducteur={!suisConducteur}
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

      {/* LE FIL. Il s'ouvre sur demande, et se DÉMONTE avec l'écran de course :
          le canal temps réel meurt avec lui, aucun abonnement ne survit à son
          fil. `ouvert` porte la fermeture — après « terminée », on lit encore
          l'historique, on n'écrit plus. */}
      {filOuvert && autre ? (
        <FilMessages
          courseId={course.id}
          monId={moi}
          prenom={autre.prenom}
          photo={autre.photo_url}
          vehicule={course.vehicule}
          ouvert={!terminee && !annulee}
          onFermer={() => setFilOuvert(false)}
        />
      ) : null}

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
  id,
  prenom,
  photo,
  telephone,
  suisConducteur,
  onEcrire,
}: {
  id: string;
  prenom: string;
  photo: string | null;
  telephone: string | null;
  suisConducteur: boolean;
  onEcrire: () => void;
}) {
  const t = useT();
  const profil = useProfilPublic(id);

  // ── BLOQUER N'EST PLUS ICI ────────────────────────────────────────────
  // Le bouton vivait à côté d'« Annuler la course ». Deux rouges empilés se
  // disputaient l'œil, alors qu'en cas de problème réel il faut UNE action
  // évidente. Et bloquer ne change rien au moment présent : on est dans la
  // voiture avec la personne, le blocage n'agit que sur les appariements
  // FUTURS. La décision est rétrospective — elle vit dans l'historique, à
  // côté de « Signaler ». Voir `FeuilleBlocage`.

  return (
    <>
      <View className="mt-12 flex-row items-center rounded-card bg-card p-16">
      <Avatar prenom={prenom} photo={photo} />
      <View className="ml-12 flex-1">
        <Text className="text-[15px] font-bold text-ink">{prenom}</Text>
        {/* Sous cinq courses, le badge remplace la note : une moyenne sur deux
            avis n'est pas une note. */}
        {profil ? (
          <Text className="text-[12px] font-semibold text-muted" numberOfLines={1}>
            {profil.est_nouveau || profil.note_moyenne === null
              ? t('profil.nouveauConducteur')
              : t('offres.note', {
                  note: String(profil.note_moyenne).replace('.', ','),
                })}
          </Text>
        ) : null}
      </View>

      {/* ÉCRIRE marche toujours ; APPELER seulement si la policy sert le
          numéro, c'est-à-dire pendant la course. Sans lui on n'affiche pas de
          bouton mort. */}
      <View className="flex-row gap-8">
        {telephone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('enRoute.appeler')}
            // ═══ LE DERNIER ENDROIT OÙ UN NUMÉRO TRANSITE ═══
            // L'appel est DIRECT : le numéro de la contrepartie part dans le
            // composeur, et de là dans le journal d'appels. Le fil interne a
            // fermé le SMS ; l'appel attend un RELAIS (type Twilio) qui
            // masquerait les deux numéros derrière un numéro de service.
            // Hors V1, et c'est la seule brèche qui reste — elle est ici,
            // écrite, pour qu'on sache où revenir.
            onPress={() => void Linking.openURL(`tel:${telephone}`)}
            className="min-h-touch items-center justify-center rounded-field bg-accFill px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-onAcc">{t('enRoute.appeler')}</Text>
          </Pressable>
        ) : null}
          {/* « Écrire » ouvre le FIL INTERNE, plus jamais les SMS de
              l'opérateur. Un SMS emporte les deux numéros et ne les rend
              jamais : la course finit, la RLS se referme, mais le numéro est
              déjà dans le répertoire d'en face. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('enRoute.ecrire')}
            onPress={onEcrire}
            className="min-h-touch items-center justify-center rounded-field bg-card2 px-16"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[13px] font-bold text-accInk">{t('enRoute.ecrire')}</Text>
          </Pressable>
      </View>
      </View>

    </>
  );
}

function Notation({
  note,
  onNote,
  puces,
  onPuce,
  pourConducteur,
  occupe,
  onEnvoyer,
}: {
  note: number;
  onNote: (n: number) => void;
  puces: string[];
  onPuce: (cle: string) => void;
  /** Les puces dépendent de qui est NOTÉ, pas de qui note. */
  pourConducteur: boolean;
  occupe: boolean;
  onEnvoyer: () => void;
}) {
  const t = useT();
  const proposees = pourConducteur ? PUCES.conducteur : PUCES.passager;
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

      {/* LES PUCES SONT FACULTATIVES, ET ELLES NE S'OUVRENT QU'APRÈS L'ÉTOILE.
          Les proposer avant, c'est demander pourquoi avant de demander combien —
          et beaucoup cocheraient sans avoir noté. Elles disent ce que l'étoile
          ne dit pas : trois étoiles sans rien n'apprend rien à personne. */}
      {note > 0 ? (
        <View className="mt-12 flex-row flex-wrap gap-8">
          {proposees.map((cle) => {
            const cochee = puces.includes(cle);
            return (
              <Pressable
                key={cle}
                accessibilityRole="button"
                accessibilityState={{ selected: cochee }}
                onPress={() => {
                  onPuce(cle);
                  void Haptics.selectionAsync();
                }}
                className={`min-h-touch justify-center rounded-full px-16 ${
                  cochee ? 'bg-accFill' : 'bg-card2'
                }`}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text
                  className={`text-[13px] font-bold ${
                    cochee ? 'text-onAcc' : 'text-muted'
                  }`}
                >
                  {t(`enRoute.puce_${cle}` as never)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
