import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import { cleErreur } from '../src/lib/erreursServeur';
import { formatXof } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useDemandeEnCours, useOffres, type Offre } from '../src/lib/offres';
import { supabase } from '../src/lib/supabase';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Offres reçues.
 *
 * Les montants sont en `moneyInk`. La mention « contre-offre » est en `accInk` —
 * l'ambre appartient aux montants, un statut ne s'y écrit jamais.
 *
 * Le flux Realtime déclenche une relecture, il ne fait pas foi : le canal se
 * ferme en arrière-plan et les offres arrivées entre-temps ne sont pas rejouées.
 * Voir `src/lib/offres.ts`.
 */

// L'entête est une rangée de zone tactile : 48, comme toute action qui ne se
// fait pas au volant. Les deux boutons par offre suivent la même règle.
const GABARIT = { entete: 48, action: 48 };

export default function OffresRecues() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const demandeEnCours = useDemandeEnCours();
  const demande = demandeEnCours.demande;
  const offres = useOffres(demande?.id ?? null);

  const [enAction, setEnAction] = useState<string | null>(null);
  const [echec, setEchec] = useState<ReturnType<typeof cleErreur> | null>(null);

  // Deux gabarits pour deux états : la liste ne se mesure que quand elle existe.
  // Le nom change avec l'état, sinon la seconde assertion se ferait avec les
  // mesures de la première.
  configurerGabarit(
    offres.offres.length > 0 ? 'offres+liste' : 'offres',
    offres.offres.length > 0
      ? { entete: GABARIT.entete, accepter: GABARIT.action, refuser: GABARIT.action }
      : { entete: GABARIT.entete },
  );

  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;

  // Le compte à rebours de la demande. Une seconde suffit : l'utilisateur lit
  // « encore 45 s », pas un centième.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(battement);
  }, []);

  const secondesRestantes = demande
    ? Math.max(0, Math.floor((new Date(demande.expires_at).getTime() - maintenant) / 1000))
    : 0;
  const expiree =
    demande !== null && demande.statut === 'ouverte' && secondesRestantes === 0;

  const agir = useCallback(
    async (offre: Offre, action: 'accepter' | 'refuser') => {
      if (!offre.id) return;
      setEnAction(offre.id);
      setEchec(null);

      const { error } =
        action === 'accepter'
          ? await supabase.rpc('accept_offer', { p_offre_id: offre.id })
          : await supabase.rpc('refuse_offer', { p_offre_id: offre.id });

      setEnAction(null);

      if (error) {
        setEchec(cleErreur(error));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        // L'échec vient souvent d'un état périmé — un autre passager a pris le
        // conducteur. On relit plutôt que de laisser une liste qui ment.
        offres.relire();
        demandeEnCours.relire();
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      offres.relire();
      demandeEnCours.relire();
    },
    [offres, demandeEnCours],
  );

  const enAttente = offres.offres.filter((o) => o.statut === 'en_attente');

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 8 }}>
      <View
        className="flex-row items-center justify-between px-16"
        onLayout={(e) => noterMesure('entete', e.nativeEvent.layout.height)}
      >
        <Text className="text-[22px] font-extrabold text-ink">{t('offres.titre')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() => router.back()}
          onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
          className="min-h-touch justify-center px-12"
        >
          <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
        </Pressable>
      </View>

      {horsLigne ? <Bandeau texte={t('offres.horsLigne')} /> : null}
      {offres.resynchronise ? <Bandeau texte={t('offres.resynchronisation')} /> : null}
      {echec ? <Bandeau texte={t(echec)} danger /> : null}

      {demandeEnCours.statut === 'chargement' ? (
        <Squelettes />
      ) : !demande ? (
        <Vide
          texte={t('offres.aucuneDemande')}
          action={t('offres.proposerUnPrix')}
          onPress={() => router.replace('/prix?service=urbain')}
        />
      ) : expiree ? (
        <Vide
          texte={t('offres.demandeExpiree')}
          action={t('offres.reproposer')}
          onPress={() => router.replace('/prix?service=urbain')}
        />
      ) : (
        <>
          <View className="px-16 pt-12">
            <Text className="text-[15px] font-bold text-ink">
              {enAttente.length === 0
                ? t('offres.attente')
                : enAttente.length === 1
                  ? t('offres.nombre', { n: enAttente.length })
                  : t('offres.nombrePluriel', { n: enAttente.length })}
            </Text>
            <Text className="mt-4 text-[13px] font-semibold text-muted">
              {t('offres.votrePrix', { prix: formatXof(demande.prix_xof) })} ·{' '}
              {secondesRestantes >= 60
                ? t('offres.encoreMinutes', { minutes: Math.ceil(secondesRestantes / 60) })
                : t('offres.encore', { secondes: secondesRestantes })}
            </Text>
          </View>

          {offres.statut === 'chargement' ? (
            <Squelettes />
          ) : offres.offres.length === 0 ? (
            <Vide texte={t('offres.vide')} />
          ) : (
            <FlatList
              data={offres.offres}
              keyExtractor={(o) => o.id ?? ''}
              className="mt-12"
              contentContainerClassName="px-16"
              contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
              renderItem={({ item }) => (
                <CarteOffre
                  offre={item}
                  prixDemande={demande.prix_xof}
                  occupe={enAction === item.id}
                  desactive={horsLigne || enAction !== null}
                  onAccepter={() => void agir(item, 'accepter')}
                  onRefuser={() => void agir(item, 'refuser')}
                />
              )}
            />
          )}
        </>
      )}

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

function CarteOffre({
  offre,
  prixDemande,
  occupe,
  desactive,
  onAccepter,
  onRefuser,
}: {
  offre: Offre;
  prixDemande: number;
  occupe: boolean;
  desactive: boolean;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  const t = useT();
  const contreOffre = offre.type === 'contre_offre';
  const disponible = offre.statut === 'en_attente';

  return (
    <View className="mb-12 rounded-card bg-card p-16">
      <View className="flex-row items-center">
        <Avatar prenom={offre.conducteur_prenom} photo={offre.conducteur_photo} />

        <View className="ml-12 flex-1">
          <Text className="text-[15px] font-bold text-ink">{offre.conducteur_prenom}</Text>
          {/* Deux lignes : en français la ligne déborde, et la note tronquée
              retire au passager l'élément sur lequel il choisit. */}
          <Text className="text-[12px] font-semibold text-muted" numberOfLines={2}>
            {t('offres.minutes', { n: offre.delai_arrivee_min ?? 0 })} ·{' '}
            {offre.vehicule_modele} {offre.vehicule_couleur} ·{' '}
            {/* Sous cinq courses, on dit ce qu'on sait — « nouveau » — plutôt
                qu'une moyenne sur deux avis, qui est du bruit présenté comme un
                chiffre. */}
            {offre.conducteur_est_nouveau || offre.conducteur_note === null
              ? t('profil.nouveauConducteur')
              : t('offres.note', { note: String(offre.conducteur_note).replace('.', ',') })}
          </Text>
        </View>

        <View className="items-end">
          {/* Le montant en moneyInk et en chiffres tabulaires. La mention de
              statut en accInk — l'ambre appartient aux montants, jamais aux
              statuts. */}
          <Text
            className="text-[19px] font-extrabold text-moneyInk"
            style={chiffresTabulaires}
          >
            {formatXof(offre.prix_xof ?? 0)}
          </Text>
          <Text className="text-[11px] font-bold text-accInk">
            {contreOffre ? t('offres.contreOffre') : t('offres.votrePrixMention')}
          </Text>
        </View>
      </View>

      {disponible ? (
        <View className="mt-12 flex-row gap-12">
          <Action
            nom="accepter"
            texte={t('offres.accepter')}
            principale
            desactive={desactive}
            occupe={occupe}
            onPress={onAccepter}
          />
          <Action
            nom="refuser"
            texte={t('offres.refuser')}
            desactive={desactive}
            occupe={occupe}
            onPress={onRefuser}
          />
        </View>
      ) : (
        <Text className="mt-12 text-[13px] font-semibold text-muted">
          {offre.statut === 'caduque'
            ? t('offres.caduque')
            : offre.statut === 'refusee'
              ? t('offres.refusee')
              : offre.statut === 'acceptee'
                ? t('offres.acceptee')
                : t('offres.demandeExpiree')}
        </Text>
      )}

      {prixDemande !== offre.prix_xof && contreOffre ? null : null}
    </View>
  );
}

function Action({
  nom,
  texte,
  principale = false,
  desactive,
  occupe,
  onPress,
}: {
  nom: string;
  texte: string;
  principale?: boolean;
  desactive: boolean;
  occupe: boolean;
  onPress: () => void;
}) {
  const actif = !desactive && !occupe;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !actif, busy: occupe }}
      disabled={!actif}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      // Un état désactivé change de COULEUR, pas seulement d'opacité.
      className={`min-h-touch flex-1 items-center justify-center rounded-field ${
        actif ? (principale ? 'bg-accFill' : 'bg-card2') : 'bg-card2'
      }`}
      style={({ pressed }) => ({ opacity: pressed && actif ? 0.7 : 1 })}
    >
      <Text
        className={`text-[14px] font-bold ${
          actif ? (principale ? 'text-onAcc' : 'text-ink') : 'text-muted'
        }`}
      >
        {texte}
      </Text>
    </Pressable>
  );
}

function Bandeau({ texte, danger = false }: { texte: string; danger?: boolean }) {
  return (
    <View className="mx-16 mt-12 rounded-field bg-card px-16 py-12">
      <Text
        className={`text-[13px] font-semibold ${danger ? 'text-danger' : 'text-ink'}`}
      >
        {texte}
      </Text>
    </View>
  );
}

/** Un écran vide est une invitation à agir. */
function Vide({
  texte,
  action,
  onPress,
}: {
  texte: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-24">
      <Text className="text-center text-[15px] font-semibold text-muted">{texte}</Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill px-24"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[15px] font-extrabold text-onAcc">{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Squelettes, jamais de roue qui tourne. */
function Squelettes() {
  return (
    <View className="px-16 pt-16">
      {[0, 1, 2].map((i) => (
        <View key={i} className="mb-12 h-[136px] rounded-card bg-card" />
      ))}
    </View>
  );
}
