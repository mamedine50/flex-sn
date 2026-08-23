import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EtatCarte } from './CarteFond';
import {
  Loupe,
  VoitureInterurbaine,
  VoitureUrbaine,
} from './IllustrationsTuiles';
import PanneauDev, { type EtatForce } from './PanneauDev';
import { useT } from '../i18n';
import CarteLocalisation from './CarteLocalisation';
import { Icone } from './Icones';
import { useEstConducteur } from '../lib/conducteur';
import { useCourse } from '../lib/course';
import { horsCouverture } from '../lib/couverture';
import { dejaVu, marquerVu } from '../lib/premiereFois';
import { configurerGabarit, noterMesure } from '../lib/gabarit';
import PastilleNotifications from './PastilleNotifications';
import { useDemandeEnCours } from '../lib/offres';
import { useLocalisation, type EtatLocalisation } from '../lib/localisation';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Le monde du PASSAGER. « Où allez-vous », la carte, les deux tuiles.
 *
 * Extrait de la route pour que l'onglet « Course » puisse rendre, à sa place,
 * la maison du conducteur — sans jamais mélanger les deux. Un conducteur au
 * volant ne doit pas voir « Où allez-vous » : c'est la question du passager.
 *
 * Accueil.
 *
 * La carte est le fond, mais l'écran ne l'attend pas : la feuille, les tuiles et
 * la barre sont montées au premier rendu et tapables immédiatement. La carte
 * arrive derrière, en fondu, une fois les interactions passées.
 *
 * Import par sous-chemin et paresseux — jamais depuis un barrel : un barrel
 * tirerait react-native-maps dans le premier bundle évalué.
 */
const CarteFond = lazy(() => import('../../src/components/CarteFond'));

/** Dakar, Plateau. Le point de repli tant qu'on ne sait rien de l'utilisateur. */
const REGION_DEFAUT = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

const DUREE_FONDU_MS = 180;

/**
 * Gabarit de la feuille, en points.
 *
 * La feuille est dictée par son CONTENU, jamais par une fraction de l'écran :
 * c'est la carte qui rétrécit sur un petit appareil. Une feuille proportionnelle
 * rogne ses propres tuiles dès que l'écran raccourcit — et une tuile a le droit
 * de rogner son dessin, la feuille n'a jamais le droit de rogner une tuile.
 */
const FEUILLE = {
  hautPadding: 12,
  poignee: 4,
  souPoignee: 12,
  tuile: 152,
  entreTuilesEtBarre: 16,
  barre: 56,
  /** Au moins ça entre la barre de recherche et la zone sûre du bas. */
  basMinimum: 16,
};

/** Ce que la feuille mesure, hors zone sûre. Sert aussi de garde en développement. */
const HAUTEUR_FEUILLE_HORS_MARGE =
  FEUILLE.hautPadding +
  FEUILLE.poignee +
  FEUILLE.souPoignee +
  FEUILLE.tuile +
  FEUILLE.entreTuilesEtBarre +
  FEUILLE.barre +
  FEUILLE.basMinimum;

export default function AccueilPassager({
  onPasserEnLigne,
}: {
  onPasserEnLigne: () => void;
}) {
  const t = useT();
  const { couleurs, radius } = useTheme();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const { etat: etatReel, position, demander, ouvrirReglages } = useLocalisation();

  const [monterCarte, setMonterCarte] = useState(false);
  const [etatCarte, setEtatCarte] = useState<EtatCarte>('attente');
  const [fondu] = useState(() => new Animated.Value(0));

  // Panneau de développement : forcer un état qu'on ne sait pas déclencher.
  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  /**
   * Le pré-écran de localisation : montré AVANT la boîte système, la toute
   * première fois. `null` tant qu'on ne sait pas s'il a déjà été vu — on
   * n'ouvre pas une carte pour la refermer aussitôt.
   */
  const [carteLoc, setCarteLoc] = useState(false);
  const [locDejaVue, setLocDejaVue] = useState<boolean | null>(null);
  const [banniereCouverture, setBanniereCouverture] = useState(false);

  useEffect(() => {
    void dejaVu('localisation').then(setLocDejaVue);
  }, []);

  // La carte n'est montée qu'une fois le premier rendu peint et le fil libre.
  // `requestIdleCallback` plutôt qu'`InteractionManager`, déprécié depuis SDK 57.

  useEffect(() => {
    const tache = requestIdleCallback(() => setMonterCarte(true), { timeout: 500 });
    return () => cancelIdleCallback(tache);
  }, []);

  useEffect(() => {
    if (etatCarte !== 'prete') return;
    void (async () => {
      const mouvementReduit = await AccessibilityInfo.isReduceMotionEnabled();
      if (mouvementReduit) {
        fondu.setValue(1);
        return;
      }
      Animated.timing(fondu, {
        toValue: 1,
        duration: DUREE_FONDU_MS,
        useNativeDriver: true,
      }).start();
    })();
  }, [etatCarte, fondu]);

  // On CONSTATE : si la position obtenue est loin de Dakar, on informe une
  // fois. Pas de blocage, pas de question — quelqu'un qui prépare un trajet
  // depuis l'étranger doit pouvoir tout ouvrir.
  useEffect(() => {
    if (!position) return;
    if (!horsCouverture(position)) return;
    void (async () => {
      if (await dejaVu('couverture')) return;
      await marquerVu('couverture');
      setBanniereCouverture(true);
    })();
  }, [position]);

  const surEtatCarte = useCallback((etat: Exclude<EtatCarte, 'attente'>) => {
    setEtatCarte(etat);
  }, []);

  // Reprendre où on en était. On ne redirige PAS d'autorité : quelqu'un qui
  // ouvre l'application pendant sa course peut vouloir regarder la carte. On
  // pose une reprise visible, il décide.
  const capacite = useEstConducteur();
  const course = useCourse();
  const demande = useDemandeEnCours();
  /**
   * ── UNE COURSE TERMINÉE N'EST PAS « EN COURS » ────────────────────────────
   * `useCourse()` sert aussi les courses TERMINÉES tant qu'on ne les a pas
   * notées — c'est le péage de la note, et il est voulu. Mais la bande
   * annonçait « Course en cours · Revenir au suivi » pour une course finie
   * depuis longtemps : on croit sa voiture en route, on appuie, on tombe sur un
   * écran de notation. Ce n'est pas la même information, et ce n'est pas la
   * même urgence.
   */
  const aNoter = course.course?.statut === 'terminee';
  const reprise = course.course
    ? {
        titre: aNoter ? t('accueil.noterCourse') : t('accueil.reprendreCourse'),
        sous: aNoter ? t('accueil.noterCourseSous') : t('accueil.reprendreCourseSous'),
        vers: '/course' as const,
      }
    : demande.demande?.statut === 'ouverte'
      ? {
          titre: t('accueil.reprendreOffres'),
          sous: t('accueil.reprendreOffresSous'),
          vers: '/offres' as const,
        }
      : null;

  // Variante : la bande de reprise n'existe qu'avec une course ou une
  // proposition en cours. Le nom change pour que l'assertion ne s'arrête pas à
  // attendre une mesure qui ne viendra jamais.
  configurerGabarit(reprise ? 'accueil+reprise' : 'accueil', {
    feuille: HAUTEUR_FEUILLE_HORS_MARGE + marges.bottom,
    tuile0: FEUILLE.tuile,
    tuile1: FEUILLE.tuile,
    ...(reprise ? { reprise: FEUILLE.barre } : {}),
  });

  const etatsPosition: EtatLocalisation[] = [
    'jamais_demandee',
    'en_cours',
    'obtenue',
    'refusee',
  ];
  const positionForcee = etatsPosition.includes(etatForce as EtatLocalisation);

  const etatPosition = positionForcee ? (etatForce as EtatLocalisation) : etatReel;
  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;
  const carteMuette = etatForce === 'carte_muette' || etatCarte === 'indisponible';

  // En état forcé « obtenue » sans vraie position, on pose le point de repli :
  // sinon le marqueur ne s'affiche pas et l'état ne se vérifie pas.
  const positionAffichee =
    etatPosition !== 'obtenue'
      ? null
      : (position ?? {
          latitude: REGION_DEFAUT.latitude,
          longitude: REGION_DEFAUT.longitude,
        });

  /**
   * ON DEMANDE LA POSITION À LA PREMIÈRE ARRIVÉE, sans attendre un geste.
   *
   * Elle n'était demandée qu'en touchant la pastille « Point de départ » :
   * quelqu'un qui installait l'application n'était donc jamais interrogé, et
   * l'accueil s'ouvrait sur une carte centrée nulle part. Toutes les
   * applications de transport demandent après la connexion, parce que sans
   * position la carte ne sert à rien.
   *
   * Une seule fois : la marque `localisation` s'écrit dès que le pré-écran a
   * été vu, refus compris. Redemander à chaque ouverture serait la boucle de
   * relance qu'on s'interdit.
   */
  const ouvrirCarteLoc =
    carteLoc || (locDejaVue === false && etatPosition === 'jamais_demandee');

  /**
   * Première fois : on explique avant de laisser partir la boîte système. Les
   * suivantes, on demande directement — la carte aurait déjà été lue.
   */
  const demanderAvecExplication = () => {
    if (locDejaVue === false) {
      setCarteLoc(true);
      return;
    }
    void demander();
  };

  const pastille: Record<EtatLocalisation, { texte: string; action?: () => void }> = {
    jamais_demandee: { texte: t('accueil.choisirDepart'), action: demanderAvecExplication },
    en_cours: { texte: t('accueil.localisationEnCours') },
    obtenue: { texte: t('accueil.maPosition') },
    refusee: { texte: t('accueil.localisationRefusee'), action: ouvrirReglages },
    indisponible: { texte: t('accueil.choisirDepart'), action: demanderAvecExplication },
  };
  const { texte, action } = pastille[etatPosition];
  const sousTitre =
    etatPosition === 'refusee' ? t('accueil.ouvrirReglages') : t('accueil.pointDepart');

  return (
    <View className="flex-1 bg-bg">
      {/* Fond neutre en `map` : même sans carte, l'écran n'est jamais gris nu. */}
      <View className="absolute inset-0 bg-map" />

      {monterCarte && !carteMuette ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fondu }]}>
          <Suspense fallback={null}>
            <CarteFond region={REGION_DEFAUT} centrerSur={position} onEtat={surEtatCarte}>
              {positionAffichee ? (
                <Marker coordinate={positionAffichee} anchor={{ x: 0.5, y: 0.5 }}>
                  {/* Aplat porteur d'information sur une carte : contour de 2 px
                      en shapeOutline, sinon il disparaît en plein soleil. */}
                  <View className="h-24 w-24 rounded-pill border-2 border-shapeOutline bg-accFill" />
                </Marker>
              ) : null}
            </CarteFond>
          </Suspense>
        </Animated.View>
      ) : null}

      {/* Zone de la carte : elle prend TOUT ce que la feuille ne prend pas.
          `minHeight: 0` pour qu'elle sache rétrécir au lieu de pousser. */}
      <View
        className="flex-1"
        style={{ paddingTop: marges.top + 8, minHeight: 0 }}
        pointerEvents="box-none"
      >
        {horsLigne ? (
          <View className="mx-16 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-semibold text-ink">
              {t('accueil.horsLigne')}
            </Text>
          </View>
        ) : null}

        {banniereCouverture ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('couverture.horsZone')}
            onPress={() => setBanniereCouverture(false)}
            className="mx-16 mt-8 rounded-field bg-card px-16 py-12"
          >
            <Text className="text-[13px] font-semibold text-ink">
              {t('couverture.horsZone')}
            </Text>
          </Pressable>
        ) : null}

        {carteMuette ? (
          <View className="mx-16 mt-8 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-bold text-ink">
              {t('accueil.carteIndisponible')}
            </Text>
            <Text className="mt-4 text-[12px] font-semibold text-muted">
              {t('accueil.carteIndisponibleAide')}
            </Text>
          </View>
        ) : null}

        <View className="flex-1" />

        {/* Raccourci conducteur : un conducteur en service bascule en un appui,
            sans passer par le Profil. Invisible pour tout le monde d'autre. */}
        {capacite === 'oui' ? (
          <View className="flex-row items-center justify-end gap-8 px-16 pb-8" pointerEvents="box-none">
            <PastilleNotifications />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('accueil.passerEnLigne')}
              onPress={onPasserEnLigne}
              className="min-h-touch flex-row items-center rounded-field border border-line bg-card px-12"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Icone nom="volant" />
              <Text className="ml-8 text-[13px] font-bold text-accInk">
                {t('accueil.passerEnLigne')}
              </Text>
            </Pressable>
          </View>
        ) : (
          // Même sans le raccourci conducteur, la cloche doit avoir sa place :
          // c'est l'accueil du passager, et c'est là qu'on apprend qu'un
          // conducteur a répondu.
          <View className="items-end px-16 pb-8" pointerEvents="box-none">
            <PastilleNotifications />
          </View>
        )}

        {/* Pastille du point de départ : 16 pt au-dessus du bord de la feuille. */}
        <View className="items-center pb-16" pointerEvents="box-none">
          <Pressable
            accessibilityRole={action ? 'button' : 'text'}
            accessibilityLabel={`${sousTitre}. ${texte}`}
            disabled={!action && !__DEV__}
            onPress={action}
            onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
            className="min-h-touch justify-center rounded-field border border-line bg-card px-12 py-8"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[10px] font-semibold text-muted">{sousTitre}</Text>
            <Text className="text-[12.5px] font-bold text-ink">{texte}</Text>
          </Pressable>
        </View>
      </View>

      {/* La feuille. Hauteur dictée par son contenu, jamais compressée : c'est la
          carte au-dessus qui cède quand l'écran raccourcit. */}
      <View
        className="shrink-0 rounded-t-sheet bg-card px-12 pt-12"
        onLayout={(e) => noterMesure('feuille', e.nativeEvent.layout.height)}
        style={{
          // Seule valeur qui ne peut pas être une classe : elle dépend de
          // l'appareil. Tout le reste du gabarit est en classes — NativeWind
          // n'applique pas une géométrie passée en `style` à côté d'un
          // `className`, et une tuile se retrouvait à 88 pt au lieu de 152.
          paddingBottom: marges.bottom + FEUILLE.basMinimum,
          // L'élévation se fait par la clarté du fond, jamais par une ombre.
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: couleurs.line,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }}
      >
        <View className="mb-12 h-4 w-[36px] self-center rounded-pill bg-line" />

        {reprise ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${reprise.titre}. ${reprise.sous}`}
            onPress={() => router.push(reprise.vers)}
            onLayout={(e) => noterMesure('reprise', e.nativeEvent.layout.height)}
            className="mb-12 min-h-driving justify-center rounded-card bg-accFill px-16 py-12"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[16px] font-extrabold text-onAcc">{reprise.titre}</Text>
            <Text className="text-[12px] font-semibold text-onAcc">{reprise.sous}</Text>
          </Pressable>
        ) : null}

        <View className="flex-row gap-12">
          <Tuile
            nom="tuile0"
            titre={t('accueil.urbain')}
            sous={t('accueil.urbainSous')}
            illustration={<VoitureUrbaine />}
            onPress={() => router.push('/prix?service=urbain')}
          />
          <Tuile
            nom="tuile1"
            titre={t('accueil.interurbain')}
            sous={t('accueil.interurbainSous')}
            illustration={<VoitureInterurbaine />}
            onPress={() => router.push('/prix?service=interurbain')}
          />
        </View>

        <Pressable
          accessibilityRole="search"
          accessibilityLabel={t('accueil.ou')}
          className="mt-16 h-[56px] flex-row items-center gap-12 rounded-field bg-card2 px-16"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Loupe />
          <Text className="text-[15px] font-bold text-ink">{t('accueil.ou')}</Text>
        </Pressable>
      </View>

      <CarteLocalisation
        visible={ouvrirCarteLoc}
        onAutoriser={() => {
          setCarteLoc(false);
          void marquerVu('localisation');
          setLocDejaVue(true);
          void demander();
        }}
        onPlusTard={() => {
          setCarteLoc(false);
          // Vue vaut vue : « Plus tard » ne se represente pas à chaque appui,
          // ce serait la boucle de relance qu'on s'interdit.
          void marquerVu('localisation');
          setLocDejaVue(true);
        }}
      />

      {__DEV__ ? (
        <PanneauDev
          visible={panneauOuvert}
          actuel={etatForce}
          onChoisir={(etat) => {
            setEtatForce(etat);
            setPanneauOuvert(false);
          }}
          onFermer={() => setPanneauOuvert(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Une tuile rogne son PROPRE dessin — l'illustration déborde volontairement en
 * bas à droite. Aucun parent ne doit la rogner : c'est pour ça que sa hauteur est
 * un plancher et que la feuille ne se compresse pas.
 */
function Tuile({
  nom,
  titre,
  sous,
  illustration,
  onPress,
}: {
  nom: string;
  titre: string;
  sous: string;
  illustration: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titre}. ${sous}`}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className="min-h-[152px] flex-1 overflow-hidden rounded-card bg-card2 p-16"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="absolute -bottom-12 -right-12">{illustration}</View>
      <Text className="text-[15.5px] font-extrabold leading-[19px] text-ink">{titre}</Text>
      <Text className="mt-4 text-[11.5px] font-semibold text-muted">{sous}</Text>
    </Pressable>
  );
}

/** Exporté pour la vérification de gabarit. */
export { HAUTEUR_FEUILLE_HORS_MARGE };
