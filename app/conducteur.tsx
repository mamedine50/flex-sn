import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import {
  delaiEstimeMin,
  distanceM,
  majEnLigne,
  useDemandesProches,
  useEnLigne,
  useEstConducteur,
  type DemandeProche,
} from '../src/lib/conducteur';
import { useCourse } from '../src/lib/course';
import { cleErreur } from '../src/lib/erreursServeur';
import { arrondirAuPas, formatXof, PAS_XOF } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useLocalisation } from '../src/lib/localisation';
import { supabase } from '../src/lib/supabase';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Mode conducteur.
 *
 * Cet écran se lit et se tape AU VOLANT. Trois conséquences tenues ici :
 *
 *   - les trois actions font 56 px, la taille « conduite » ;
 *   - elles se distinguent par la COULEUR et la POSITION, pas par le texte —
 *     l'accepter est plein et à gauche, le refuser est sourd et à droite ;
 *   - le prix est le plus gros élément de la carte, parce que c'est la seule
 *     chose qu'on décide.
 *
 * Ce que le conducteur voit du passager : un prénom, une note, une maille
 * arrondie et un nom de commune. Ni nom complet, ni numéro, ni point exact, ni
 * le texte libre — tout ça arrive avec la course, et seulement après.
 */

const GABARIT = { bascule: 56, accepter: 56, contre: 56, refuser: 56 };

type EtatAction =
  | { statut: 'repos' }
  | { statut: 'envoi'; demande: string }
  | { statut: 'echec'; cle: ReturnType<typeof cleErreur> };

export default function ModeConducteur() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const { position, demander } = useLocalisation();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const capacite = useEstConducteur();
  const { enLigne: enLigneBase, setEnLigne } = useEnLigne();
  const enLigne = enLigneBase === true;
  const file = useDemandesProches(enLigne);

  // Une offre acceptée verrouille une course, et le conducteur ne l'apprend
  // que par la base : `submit_offer()` rend la main sans savoir si le passager
  // dira oui. Sans cette bascule, il resterait sur une file de demandes alors
  // qu'il a déjà quelqu'un qui l'attend.
  const course = useCourse();
  const courseActive = course.course?.id ?? null;
  useEffect(() => {
    if (courseActive) router.replace('/course');
  }, [courseActive]);

  const [ecartees, setEcartees] = useState<string[]>([]);
  const [action, setAction] = useState<EtatAction>({ statut: 'repos' });
  const [contreOffre, setContreOffre] = useState<DemandeProche | null>(null);

  const horsLigneReseau =
    etatForce === 'hors_ligne' || reseau.isInternetReachable === false;

  // Le battement du compte à rebours : une demande peut expirer pendant qu'on
  // la lit, et les actions doivent s'éteindre à cet instant précis.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(battement);
  }, []);

  const basculer = useCallback(
    async (valeur: boolean) => {
      if (!position) {
        void demander();
        return;
      }
      setEnLigne(valeur);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await majEnLigne(position, valeur);
      if (valeur) file.relire();
    },
    [position, demander, file, setEnLigne],
  );

  const repondre = useCallback(
    async (demande: DemandeProche, prix: number, delai: number) => {
      if (!demande.id) return;
      setAction({ statut: 'envoi', demande: demande.id });

      const { error } = await supabase.rpc('submit_offer', {
        p_demande_id: demande.id,
        p_type: prix === demande.prix_xof ? 'acceptation' : 'contre_offre',
        p_prix_xof: prix,
        p_delai_arrivee_min: delai,
      });

      if (error) {
        // Deux conducteurs sur la même demande : le second reçoit
        // `demande_verrouillee`, qui se traduit en une phrase — pas un code.
        setAction({ statut: 'echec', cle: cleErreur(error) });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        file.relire();
        return;
      }

      setAction({ statut: 'repos' });
      setContreOffre(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      file.relire();
    },
    [file],
  );

  const visibles = useMemo(
    () => file.demandes.filter((d) => d.id && !ecartees.includes(d.id)),
    [file.demandes, ecartees],
  );

  configurerGabarit(
    visibles.length > 0 ? 'conducteur+file' : 'conducteur',
    visibles.length > 0
      ? {
          bascule: GABARIT.bascule,
          accepter: GABARIT.accepter,
          contre: GABARIT.contre,
          refuser: GABARIT.refuser,
        }
      : { bascule: GABARIT.bascule },
  );

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 8 }}>
      <View className="flex-row items-center justify-between px-16">
        <Text className="text-[22px] font-extrabold text-ink">{t('conducteur.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
          className="min-h-touch justify-center px-12"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {capacite === 'non' ? (
        <Message
          titre={t('conducteur.pasConducteur')}
          aide={t('conducteur.pasConducteurAide')}
        />
      ) : (
        <>
          <View
            className="mx-16 mt-12 min-h-driving flex-row items-center justify-between rounded-card bg-card px-16"
            onLayout={(e) => noterMesure('bascule', e.nativeEvent.layout.height)}
          >
            <Text className="text-[16px] font-extrabold text-ink">
              {enLigne ? t('conducteur.enLigne') : t('conducteur.horsLigne')}
            </Text>
            <Switch
              value={enLigne}
              onValueChange={(v) => void basculer(v)}
              accessibilityLabel={
                enLigne ? t('conducteur.passerHorsLigne') : t('conducteur.passerEnLigne')
              }
            />
          </View>

          {horsLigneReseau ? <Bandeau texte={t('conducteur.reseauCoupe')} /> : null}
          {action.statut === 'echec' ? <Bandeau texte={t(action.cle)} danger /> : null}

          {/* La position LOCALE ne sert qu'à estimer un délai d'arrivée. Celle
              qui décide de l'appariement est publiée en base. Un GPS coupé ne
              doit donc pas masquer la file — il rend l'estimation approximative,
              et on le dit. */}
          {enLigne && !position ? <Bandeau texte={t('conducteur.positionRequise')} /> : null}

          {!enLigne ? (
            <Message titre={t('conducteur.horsLigneInvite')} />
          ) : file.statut === 'chargement' ? (
            <Squelettes />
          ) : visibles.length === 0 ? (
            <Message titre={t('conducteur.aucuneDemande')} />
          ) : (
            <FlatList
              data={visibles}
              keyExtractor={(d) => d.id ?? ''}
              className="mt-12"
              contentContainerClassName="px-16"
              contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
              renderItem={({ item }) => (
                <CarteDemande
                  demande={item}
                  position={position}
                  maintenant={maintenant}
                  occupe={action.statut === 'envoi' && action.demande === item.id}
                  gele={horsLigneReseau || action.statut === 'envoi'}
                  onAccepter={(delai) =>
                    void repondre(item, item.prix_xof ?? 0, delai)
                  }
                  onContreProposer={() => setContreOffre(item)}
                  onRefuser={() => {
                    setEcartees((liste) => [...liste, item.id ?? '']);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                />
              )}
            />
          )}
        </>
      )}

      {contreOffre ? (
        <FeuilleContreOffre
          demande={contreOffre}
          position={position}
          occupe={action.statut === 'envoi'}
          onEnvoyer={(prix, delai) => void repondre(contreOffre, prix, delai)}
          onFermer={() => setContreOffre(null)}
        />
      ) : null}

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

function CarteDemande({
  demande,
  position,
  maintenant,
  occupe,
  gele,
  onAccepter,
  onContreProposer,
  onRefuser,
}: {
  demande: DemandeProche;
  position: { latitude: number; longitude: number } | null;
  maintenant: number;
  occupe: boolean;
  gele: boolean;
  onAccepter: (delai: number) => void;
  onContreProposer: () => void;
  onRefuser: () => void;
}) {
  const t = useT();

  const expiree =
    demande.expires_at !== null &&
    new Date(demande.expires_at).getTime() - maintenant <= 0;

  const delai = useMemo(() => {
    if (!position || demande.zone_depart_lat === null || demande.zone_depart_lon === null) {
      return 5;
    }
    return delaiEstimeMin(
      distanceM(position, {
        latitude: demande.zone_depart_lat,
        longitude: demande.zone_depart_lon,
      }),
    );
  }, [position, demande.zone_depart_lat, demande.zone_depart_lon]);

  const actif = !gele && !expiree;

  return (
    <View className="mb-12 rounded-card bg-card p-16">
      {/* Le prix d'abord : c'est la seule chose qu'on décide. */}
      <Text className="text-[12px] font-semibold text-muted">
        {t('conducteur.prixPropose')}
      </Text>
      <Text
        className="text-[38px] font-extrabold text-moneyInk"
        style={chiffresTabulaires}
      >
        {formatXof(demande.prix_xof ?? 0)}
      </Text>

      <Text className="mt-8 text-[14px] font-bold text-ink">
        {/* Jamais le nom de commune sec : il vient de centroïdes approximatifs. */}
        {t('conducteur.depuis', {
          commune: t('conducteur.versCommune', {
            commune: demande.depart_commune ?? '—',
          }),
        })}
      </Text>
      <Text className="text-[13px] font-semibold text-muted">
        {t('conducteur.versDestination', {
          commune: demande.destination_commune ?? demande.destination_libelle ?? '—',
        })}{' '}
        · {t('conducteur.arriveeEstimee', { minutes: delai })}
      </Text>
      <Text className="mt-4 text-[13px] font-semibold text-muted">
        {demande.passager_prenom}
        {demande.passager_note !== null
          ? ` · ★ ${String(demande.passager_note).replace('.', ',')}`
          : ''}
      </Text>

      {expiree ? (
        <Text className="mt-12 text-[13px] font-bold text-muted">
          {t('conducteur.expiree')}
        </Text>
      ) : (
        <View className="mt-12 flex-row gap-8">
          {/* Couleur et position portent le sens : plein à gauche pour accepter,
              sourd à droite pour refuser. Le texte n'est pas la distinction. */}
          <ActionConduite
            nom="accepter"
            texte={t('conducteur.accepterA', { prix: formatXof(demande.prix_xof ?? 0) })}
            ton="principale"
            large
            actif={actif}
            occupe={occupe}
            onPress={() => onAccepter(delai)}
          />
          <ActionConduite
            nom="contre"
            texte={t('conducteur.contreProposer')}
            ton="neutre"
            actif={actif}
            occupe={false}
            onPress={onContreProposer}
          />
          <ActionConduite
            nom="refuser"
            texte={t('conducteur.refuser')}
            ton="sourde"
            actif={actif}
            occupe={false}
            onPress={onRefuser}
          />
        </View>
      )}
    </View>
  );
}

function ActionConduite({
  nom,
  texte,
  ton,
  large = false,
  actif,
  occupe,
  onPress,
}: {
  nom: string;
  texte: string;
  ton: 'principale' | 'neutre' | 'sourde';
  large?: boolean;
  actif: boolean;
  occupe: boolean;
  onPress: () => void;
}) {
  const utilisable = actif && !occupe;
  const fond = !utilisable
    ? 'bg-card2'
    : ton === 'principale'
      ? 'bg-accFill'
      : ton === 'neutre'
        ? 'bg-card2'
        : 'bg-card2';
  const encre = !utilisable
    ? 'text-muted'
    : ton === 'principale'
      ? 'text-onAcc'
      : ton === 'neutre'
        ? 'text-accInk'
        : 'text-muted';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !utilisable, busy: occupe }}
      disabled={!utilisable}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className={`min-h-driving items-center justify-center rounded-field px-12 ${fond} ${
        large ? 'flex-[2]' : 'flex-1'
      }`}
      style={({ pressed }) => ({ opacity: pressed && utilisable ? 0.7 : 1 })}
    >
      <Text className={`text-center text-[13px] font-extrabold ${encre}`} numberOfLines={2}>
        {texte}
      </Text>
    </Pressable>
  );
}

function FeuilleContreOffre({
  demande,
  position,
  occupe,
  onEnvoyer,
  onFermer,
}: {
  demande: DemandeProche;
  position: { latitude: number; longitude: number } | null;
  occupe: boolean;
  onEnvoyer: (prix: number, delai: number) => void;
  onFermer: () => void;
}) {
  const t = useT();
  const depart = demande.prix_xof ?? 0;
  const [prix, setPrix] = useState(arrondirAuPas(depart + PAS_XOF * 2));
  const [delai, setDelai] = useState(() => {
    if (!position || demande.zone_depart_lat === null || demande.zone_depart_lon === null) {
      return 5;
    }
    return delaiEstimeMin(
      distanceM(position, {
        latitude: demande.zone_depart_lat,
        longitude: demande.zone_depart_lon,
      }),
    );
  });

  const pas = (sens: 1 | -1) => {
    setPrix((p) => Math.max(PAS_XOF, p + sens * PAS_XOF));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onFermer}>
      <Pressable className="flex-1 justify-end bg-bg/70" onPress={onFermer}>
        <Pressable className="rounded-t-sheet bg-card px-16 pb-32 pt-16">
          <Text className="text-[12px] font-semibold text-muted">
            {t('conducteur.votreContreOffre')}
          </Text>
          <Text
            className="mt-4 text-[40px] font-extrabold text-moneyInk"
            style={chiffresTabulaires}
          >
            {formatXof(prix)}
          </Text>

          <View className="mt-12 flex-row items-center gap-12">
            <PasRond signe="−" libelle={t('prix.baisser')} onPress={() => pas(-1)} />
            <Text className="text-[13px] font-bold text-muted" style={chiffresTabulaires}>
              {formatXof(PAS_XOF)}
            </Text>
            <PasRond signe="+" libelle={t('prix.monter')} onPress={() => pas(1)} />
          </View>

          <Text className="mt-16 text-[12px] font-semibold text-muted">
            {t('conducteur.votreDelai')}
          </Text>
          <View className="mt-8 flex-row items-center gap-12">
            <PasRond
              signe="−"
              libelle={t('conducteur.votreDelai')}
              onPress={() => setDelai((d) => Math.max(1, d - 1))}
            />
            <Text className="text-[17px] font-extrabold text-ink" style={chiffresTabulaires}>
              {t('conducteur.minutes', { n: delai })}
            </Text>
            <PasRond
              signe="+"
              libelle={t('conducteur.votreDelai')}
              onPress={() => setDelai((d) => Math.min(180, d + 1))}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: occupe, busy: occupe }}
            disabled={occupe}
            onPress={() => onEnvoyer(prix, delai)}
            className={`mt-16 min-h-driving items-center justify-center rounded-button ${
              occupe ? 'bg-card2' : 'bg-accFill'
            }`}
            style={({ pressed }) => ({ opacity: pressed && !occupe ? 0.7 : 1 })}
          >
            <Text
              className={`text-[16px] font-extrabold ${occupe ? 'text-muted' : 'text-onAcc'}`}
            >
              {occupe ? t('conducteur.envoiEnCours') : t('conducteur.envoyerContreOffre')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PasRond({
  signe,
  libelle,
  onPress,
}: {
  signe: string;
  libelle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      className="min-h-driving w-[72px] items-center justify-center rounded-field bg-card2"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text className="text-[24px] font-extrabold text-ink">{signe}</Text>
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

/** Un écran vide est une invitation à agir. */
function Message({ titre, aide }: { titre: string; aide?: string }) {
  return (
    <View className="flex-1 items-center justify-center px-24">
      <Text className="text-center text-[15px] font-semibold text-muted">{titre}</Text>
      {aide ? (
        <Text className="mt-8 text-center text-[13px] font-semibold text-muted">{aide}</Text>
      ) : null}
    </View>
  );
}

/** Squelettes, jamais de roue qui tourne. */
function Squelettes() {
  return (
    <View className="px-16 pt-16">
      {[0, 1].map((i) => (
        <View key={i} className="mb-12 h-[220px] rounded-card bg-card" />
      ))}
    </View>
  );
}
