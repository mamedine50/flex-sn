import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

import { useT } from '../i18n';
import {
  delaiEstimeMin,
  distanceM,
  useDemandesProches,
  useNegociations,
  type Negociation,
  type DemandeProche,
} from '../lib/conducteur';
import { cleErreur } from '../lib/erreursServeur';
import { arrondirAuPas, formatXof, PAS_XOF } from '../lib/format';
import { configurerGabarit, noterMesure } from '../lib/gabarit';
import { supabase } from '../lib/supabase';
import { chiffresTabulaires } from '../theme/typographie';

/**
 * La file des demandes, telle qu'elle remonte sur la carte du conducteur.
 *
 * DÉPLACEMENT DE PRÉSENTATION, PAS DE COMPORTEMENT. Les RPC, les états, le
 * rafraîchissement, les retours haptiques et les messages d'erreur sont ceux de
 * l'ancien écran, à la ligne près. Ce qui a changé : elle ne porte plus sa
 * propre coquille — plus de titre, plus de bascule en ligne, plus de bouton
 * retour. La maison du conducteur s'en charge, et la feuille ne fait qu'une
 * chose.
 *
 * Elle se lit et se tape AU VOLANT. Trois conséquences tenues ici :
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

const GABARIT = { accepter: 56, contre: 56, refuser: 56 };

type EtatAction =
  | { statut: 'repos' }
  | { statut: 'envoi'; demande: string }
  | { statut: 'echec'; cle: ReturnType<typeof cleErreur> };

export default function FileDemandes({
  enLigne,
  position,
  gele,
  /**
   * Pourquoi Accepter est inactif, s'il l'est. Le verrou anti-enchaînement et
   * le péage de la note passent par ici : la file reste LISIBLE, seule
   * l'acceptation s'éteint — et elle dit pourquoi.
   */
  raisonInactive,
  basPage = 24,
}: {
  enLigne: boolean;
  position: { latitude: number; longitude: number } | null;
  gele: boolean;
  raisonInactive?: string | null;
  basPage?: number;
}) {
  const t = useT();
  const file = useDemandesProches(enLigne);
  const { negociations, relire: relireNegociations } = useNegociations(enLigne);

  const [ecartees, setEcartees] = useState<string[]>([]);
  const [action, setAction] = useState<EtatAction>({ statut: 'repos' });
  const [contreOffre, setContreOffre] = useState<DemandeProche | null>(null);

  // Le battement du compte à rebours : une demande peut expirer pendant qu'on
  // la lit, et les actions doivent s'éteindre à cet instant précis.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(battement);
  }, []);

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

  const repondreNegociation = useCallback(
    async (n: Negociation, quoi: 'accepter' | 'refuser') => {
      if (!n.id) return;
      setAction({ statut: 'envoi', demande: n.id });
      const { error } =
        quoi === 'accepter'
          ? await supabase.rpc('accept_offer', { p_offre_id: n.id })
          : await supabase.rpc('refuse_offer', { p_offre_id: n.id });

      if (error) {
        setAction({ statut: 'echec', cle: cleErreur(error) });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        relireNegociations();
        return;
      }

      setAction({ statut: 'repos' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      relireNegociations();
      file.relire();
    },
    [file, relireNegociations],
  );

  const visibles = useMemo(
    () => file.demandes.filter((d) => d.id && !ecartees.includes(d.id)),
    [file.demandes, ecartees],
  );

  configurerGabarit(
    visibles.length > 0 ? 'file+demandes' : 'file',
    visibles.length > 0 ? GABARIT : {},
  );

  if (!enLigne) return null;

  return (
    <>
      {action.statut === 'echec' ? <Bandeau texte={t(action.cle)} danger /> : null}

      {raisonInactive ? <Bandeau texte={raisonInactive} /> : null}

      {/* ON VOUS A RÉPONDU. En TÊTE de la file, et c'est délibéré : une
          contre-proposition attend une réponse de VOUS, alors qu'une demande
          nouvelle attend n'importe qui. Ce qui vous est adressé passe devant ce
          qui est ouvert à tous. */}
      {negociations.length > 0 ? (
        <View className="px-16 pb-8">
          <Text className="pb-8 text-[12px] font-bold uppercase tracking-wider text-accInk">
            {t('conducteur.negociations')}
          </Text>
          {negociations.map((n) => (
            <CarteNegociation
              key={n.id ?? ''}
              negociation={n}
              gele={gele || action.statut === 'envoi'}
              accepterInactif={Boolean(raisonInactive)}
              occupe={action.statut === 'envoi' && action.demande === n.id}
              onAccepter={() => void repondreNegociation(n, 'accepter')}
              onRefuser={() => void repondreNegociation(n, 'refuser')}
            />
          ))}
        </View>
      ) : null}

      {file.statut === 'chargement' ? (
        <Squelettes />
      ) : visibles.length === 0 && negociations.length === 0 ? (
        <Message titre={t('conducteur.aucuneDemande')} />
      ) : visibles.length === 0 ? null : (
        <FlatList
          data={visibles}
          keyExtractor={(d) => d.id ?? ''}
          contentContainerClassName="px-16"
          contentContainerStyle={{ paddingBottom: basPage }}
          renderItem={({ item }) => (
            <CarteDemande
              demande={item}
              position={position}
              maintenant={maintenant}
              occupe={action.statut === 'envoi' && action.demande === item.id}
              gele={gele || action.statut === 'envoi'}
              accepterInactif={Boolean(raisonInactive)}
              onAccepter={(delai) => void repondre(item, item.prix_xof ?? 0, delai)}
              onContreProposer={() => setContreOffre(item)}
              onRefuser={() => {
                setEcartees((liste) => [...liste, item.id ?? '']);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
          )}
        />
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
    </>
  );
}

/**
 * Une contre-proposition du passager.
 *
 * PAS DE CONTRE-PROPOSITION EN RETOUR ICI, et ce n'est pas un oubli : quand le
 * passager a répondu, le fil est au tour 2 ou 4. Au tour 4 la négociation est
 * close ; au tour 2 le conducteur pourrait relancer, mais l'écran ne le propose
 * pas — deux allers-retours se décident sur un chiffre, pas sur une
 * conversation, et un conducteur au volant ne doit pas marchander. Il accepte,
 * ou il refuse.
 */
function CarteNegociation({
  negociation,
  gele,
  accepterInactif,
  occupe,
  onAccepter,
  onRefuser,
}: {
  negociation: Negociation;
  gele: boolean;
  accepterInactif: boolean;
  occupe: boolean;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  const t = useT();
  const actif = !gele && !occupe;

  return (
    <View className="mb-8 rounded-card bg-card p-16">
      <Text className="text-[12px] font-semibold text-muted">
        {t('conducteur.vousAviezPropose', {
          prix: formatXof(negociation.prix_demande_xof ?? 0),
        })}
      </Text>
      <Text
        className="mt-4 text-[24px] font-extrabold text-moneyInk"
        style={chiffresTabulaires}
      >
        {formatXof(negociation.prix_xof ?? 0)}
      </Text>
      <Text className="mt-2 text-[13px] font-bold text-ink" numberOfLines={1}>
        {negociation.passager_prenom}
        {negociation.passager_note !== null
          ? ` · ${t('offres.note', {
              note: String(negociation.passager_note).replace('.', ','),
            })}`
          : ''}
      </Text>
      <Text className="mt-1 text-[12px] font-semibold text-muted" numberOfLines={1}>
        {t('conducteur.versDestination', {
          commune: negociation.destination_libelle ?? '',
        })}
      </Text>

      <View className="mt-12 flex-row gap-8">
        <Pressable
          accessibilityRole="button"
          disabled={!actif || accepterInactif}
          onPress={onAccepter}
          className={`min-h-driving flex-1 items-center justify-center rounded-button ${
            actif && !accepterInactif ? 'bg-accFill' : 'bg-card2'
          }`}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text
            className={`text-[14px] font-extrabold ${
              actif && !accepterInactif ? 'text-onAcc' : 'text-muted'
            }`}
          >
            {t('conducteur.accepterA', {
              prix: formatXof(negociation.prix_xof ?? 0),
            })}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!actif}
          onPress={onRefuser}
          className="min-h-driving w-48 items-center justify-center rounded-button bg-card2"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[16px] font-bold text-muted">✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CarteDemande({
  demande,
  position,
  maintenant,
  occupe,
  gele,
  accepterInactif = false,
  onAccepter,
  onContreProposer,
  onRefuser,
}: {
  demande: DemandeProche;
  position: { latitude: number; longitude: number } | null;
  maintenant: number;
  occupe: boolean;
  gele: boolean;
  /** Le verrou anti-enchaînement : la carte reste lisible, Accepter s'éteint. */
  accepterInactif?: boolean;
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
            // Sous verrou, on ne peut plus S'ENGAGER — ni accepter, ni
            // contre-proposer, parce qu'une contre-offre acceptée crée une
            // seconde course et que le serveur la refuse déjà par
            // `conducteur_indisponible`. Laisser le bouton vif produirait un
            // message d'erreur là où une règle claire suffit. Lire et refuser
            // restent possibles : on ne prive pas le conducteur de sa file.
            actif={actif && !accepterInactif}
            occupe={occupe}
            onPress={() => onAccepter(delai)}
          />
          <ActionConduite
            nom="contre"
            texte={t('conducteur.contreProposer')}
            ton="neutre"
            actif={actif && !accepterInactif}
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
