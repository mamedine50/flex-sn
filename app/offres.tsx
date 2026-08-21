import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import MinuteurCirculaire from '../src/components/MinuteurCirculaire';
import RadarAttente from '../src/components/RadarAttente';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import { cleErreur } from '../src/lib/erreursServeur';
import { formatXof } from '../src/lib/format';
import { useGardeSession } from '../src/lib/garde';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import {
  annulerDemande,
  useDemandeEnCours,
  useOffres,
  type Offre,
} from '../src/lib/offres';
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
// fait pas au volant. Les deux boutons par offre suivent la même règle. Le
// rappel porte le minuteur : sous 62 il le rognerait.
const GABARIT = { entete: 48, rappel: 62, action: 48 };

export default function OffresRecues() {
  const t = useT();
  // Cet écran écrit : sans session, il n'a rien à montrer. La garde
  // emporte le chemin, et la connexion y revient.
  useGardeSession('/offres');
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [annulation, setAnnulation] = useState<'repos' | 'confirme' | 'envoi'>(
    'repos',
  );

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
      ? {
          entete: GABARIT.entete,
          rappel: GABARIT.rappel,
          accepter: GABARIT.action,
          refuser: GABARIT.action,
        }
      : { entete: GABARIT.entete, rappel: GABARIT.rappel },
  );

  const horsLigne =
    etatForce === 'hors_ligne' || reseau.isInternetReachable === false;

  // Le compte à rebours de la demande. Une seconde suffit : l'utilisateur lit
  // « encore 45 s », pas un centième.
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const battement = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(battement);
  }, []);

  const secondesRestantes = demande
    ? Math.max(
        0,
        Math.floor(
          (new Date(demande.expires_at).getTime() - maintenant) / 1000,
        ),
      )
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

      // Accepter, c'est verrouiller une course. Rester sur la liste laisserait
      // le passager devant des offres devenues caduques pendant que sa voiture
      // roule vers lui.
      if (action === 'accepter') {
        router.replace('/course');
        return;
      }

      offres.relire();
      demandeEnCours.relire();
    },
    [offres, demandeEnCours],
  );

  const enAttente = offres.offres.filter((o) => o.statut === 'en_attente');

  // LE TRI SE FAIT À L'AFFICHAGE, pas en base : la vue sert les offres, elle ne
  // décide pas de l'ordre dans lequel on les compare. La moins chère en haut,
  // parce que c'est la question que le passager se pose en premier.
  const triees = [...offres.offres].sort(
    (a, b) => (a.prix_xof ?? 0) - (b.prix_xof ?? 0),
  );

  // La meilleure offre est la moins chère PARMI CELLES QU'ON PEUT ENCORE
  // ACCEPTER. Décerner le badge à une offre caduque enverrait le passager vers
  // un bouton éteint.
  const meilleureId =
    enAttente.length > 0
      ? enAttente.reduce((moins, o) =>
          (o.prix_xof ?? 0) < (moins.prix_xof ?? 0) ? o : moins,
        ).id
      : null;

  // Le total sert à remplir l'anneau. Il se déduit de la demande elle-même —
  // aucune constante en dur : le délai d'expiration vit en base, et il changera.
  const dureeTotaleS = demande
    ? Math.max(
        1,
        Math.round(
          (new Date(demande.expires_at).getTime() -
            new Date(demande.cree_le).getTime()) /
            1000,
        ),
      )
    : 1;

  const retirer = useCallback(async () => {
    if (!demande) return;
    setAnnulation('envoi');
    const { error } = await annulerDemande(demande.id);
    if (error) {
      setAnnulation('repos');
      setEchec(cleErreur(error));
      // L'échec vient souvent d'un état périmé — la demande vient d'être
      // verrouillée pendant qu'on hésitait. On relit plutôt que d'insister.
      demandeEnCours.relire();
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/');
  }, [demande, demandeEnCours]);

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 8 }}>
      <View
        className="flex-row items-center justify-between px-16"
        onLayout={(e) => noterMesure('entete', e.nativeEvent.layout.height)}
      >
        <Text className="text-[22px] font-extrabold text-ink">
          {t('offres.titre')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('commun.retour')}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace('/')
          }
          onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
          className="min-h-touch justify-center px-12"
        >
          <Text className="text-[15px] font-bold text-accInk">
            {t('commun.retour')}
          </Text>
        </Pressable>
      </View>

      {horsLigne ? <Bandeau texte={t('offres.horsLigne')} /> : null}
      {offres.resynchronise ? (
        <Bandeau texte={t('offres.resynchronisation')} />
      ) : null}
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
          {/* LE RAPPEL. Ce que j'ai proposé, où je vais, et combien de temps
              il reste — le tout sans quitter des yeux la liste. Le minuteur est
              circulaire parce qu'« encore 4 min » ne dit pas s'il en restait
              dix ou cinq : c'est un chiffre sans échelle, et c'est justement
              l'échelle qu'on regarde quand on hésite à accepter. */}
          <View
            className="mx-16 mt-12 flex-row items-center rounded-card bg-card px-16 py-12"
            onLayout={(e) => noterMesure('rappel', e.nativeEvent.layout.height)}
          >
            <View className="flex-1 pr-12">
              <Text className="text-[13px] font-bold text-ink">
                {t('offres.propositionPartie')}
              </Text>
              <Text
                className="mt-2 text-[12px] font-semibold text-muted"
                numberOfLines={1}
              >
                {t('offres.votrePrix', { prix: '' }).trim()}{' '}
                <Text className="font-extrabold text-moneyInk" style={chiffresTabulaires}>
                  {formatXof(demande.prix_xof)}
                </Text>
                {` · ${demande.depart_libelle} → ${demande.destination_libelle}`}
              </Text>
            </View>
            <MinuteurCirculaire
              secondesRestantes={secondesRestantes}
              secondesTotal={dureeTotaleS}
            />
          </View>

          {offres.statut === 'chargement' ? (
            <Squelettes />
          ) : triees.length === 0 ? (
            /* PAS UN GRAND BLANC. C'est l'état où l'écran passe le plus de
               temps : entre la proposition et la première réponse. Un vide à
               cet instant se lit comme une panne. */
            <View className="flex-1 items-center justify-center px-24">
              <RadarAttente />
              <Text className="mt-24 text-center text-[15px] font-bold text-ink">
                {t('offres.chercheChauffeurs')}
              </Text>
              <Text className="mt-8 max-w-[240px] text-center text-[13px] font-semibold text-muted">
                {t('offres.chercheChauffeursAide')}
              </Text>
            </View>
          ) : (
            <>
              {/* Le compteur ne compte que ce qu'on peut ENCORE accepter. La
                  liste, elle, garde les offres résolues — « ce conducteur a pris
                  une autre course » vaut mieux qu'une carte qui disparaît sous
                  le doigt. D'où la condition : sans offre en attente, un
                  « 0 offres » posé au-dessus de cartes visibles se lit comme un
                  bogue de comptage. */}
              {enAttente.length > 0 ? (
                <Text className="px-16 pt-12 text-[12px] font-bold text-accInk">
                  {enAttente.length === 1
                    ? t('offres.compteur', { n: enAttente.length })
                    : t('offres.compteurPluriel', { n: enAttente.length })}
                </Text>
              ) : null}
              <FlatList
                data={triees}
                keyExtractor={(o) => o.id ?? ''}
                className="mt-8"
                contentContainerClassName="px-16"
                contentContainerStyle={{ paddingBottom: marges.bottom + 24 }}
                renderItem={({ item }) => (
                  <CarteOffre
                    offre={item}
                    meilleure={item.id === meilleureId}
                    occupe={enAction === item.id}
                    desactive={horsLigne || enAction !== null}
                    onAccepter={() => void agir(item, 'accepter')}
                    onRefuser={() => void agir(item, 'refuser')}
                  />
                )}
              />
            </>
          )}

          {/* Sobre, en bas, en `danger` : c'est une sortie, pas une action du
              parcours. Elle ne doit pas concurrencer « Accepter ». */}
          {/* La zone sûre est la seule valeur de cette pile qui ne peut pas être
              une classe : elle dépend de l'appareil. Elle est portée par un
              conteneur nu, pas mélangée à un `className`. */}
          <View style={{ paddingBottom: marges.bottom + 12 }}>
            <Pressable
              accessibilityRole="button"
              disabled={
                horsLigne || enAction !== null || annulation !== 'repos'
              }
              onPress={() => setAnnulation('confirme')}
              className="mx-16 min-h-touch items-center justify-center rounded-field bg-card"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                className={`text-[14px] font-bold ${
                  horsLigne || enAction !== null ? 'text-muted' : 'text-danger'
                }`}
              >
                {annulation === 'envoi'
                  ? t('offres.annulationEnCours')
                  : t('offres.annulerDemande')}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Une demande retirée ne se récupère pas : on confirme. */}
      <Modal
        visible={annulation === 'confirme'}
        transparent
        animationType="fade"
      >
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setAnnulation('repos')}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('offres.confirmerAnnulation')}
            </Text>
            <Text className="mt-8 text-[13px] font-semibold text-muted">
              {t('offres.confirmerAnnulationAide')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retirer()}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-danger">
                {t('offres.annulerDemande')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAnnulation('repos')}
              className="mt-8 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('offres.garder')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
  meilleure,
  occupe,
  desactive,
  onAccepter,
  onRefuser,
}: {
  offre: Offre;
  meilleure: boolean;
  occupe: boolean;
  desactive: boolean;
  onAccepter: () => void;
  onRefuser: () => void;
}) {
  const t = useT();
  const contreOffre = offre.type === 'contre_offre';
  const disponible = offre.statut === 'en_attente';
  const prix = offre.prix_xof ?? 0;

  return (
    <View
      className={`mb-12 rounded-card bg-card p-16 ${
        meilleure ? 'border-2 border-accInk' : ''
      }`}
    >
      {/* LE BADGE NE SORT QUE SUR LA MOINS CHÈRE. Le mettre partout ne dirait
          plus rien ; le contour de 2 px le double pour qui ne lit pas les
          majuscules. */}
      {meilleure ? (
        <View className="mb-12 self-start rounded-full bg-accFill px-12 py-4">
          <Text className="text-[10px] font-extrabold text-onAcc">
            {t('offres.meilleurPrix')}
          </Text>
        </View>
      ) : null}

      <View className="flex-row items-center">
        <Avatar prenom={offre.conducteur_prenom} photo={offre.conducteur_photo} />

        <View className="ml-12 flex-1">
          <Text className="text-[15px] font-extrabold text-ink" numberOfLines={1}>
            {offre.conducteur_prenom}
          </Text>
          <Text className="mt-2 text-[12px] font-semibold text-muted" numberOfLines={1}>
            {/* Sous cinq courses au volant, on dit ce qu'on sait — « nouveau » —
                plutôt qu'une moyenne sur deux avis, qui est du bruit présenté
                comme un chiffre. */}
            {offre.conducteur_est_nouveau || offre.conducteur_note === null
              ? t('profil.nouveauConducteur')
              : `${t('offres.note', {
                  note: String(offre.conducteur_note).replace('.', ','),
                })} · ${t('offres.coursesAuVolant', {
                  n: offre.conducteur_nb_courses ?? 0,
                })}`}
          </Text>
          <Text className="mt-1 text-[12px] font-semibold text-muted" numberOfLines={1}>
            {offre.vehicule_modele} {offre.vehicule_couleur}
          </Text>
        </View>

        <View className="items-end pl-8">
          {/* Le montant en moneyInk et en chiffres tabulaires : l'ambre
              appartient aux montants. */}
          <Text
            className="text-[20px] font-extrabold text-moneyInk"
            style={chiffresTabulaires}
          >
            {formatXof(prix)}
          </Text>
          {/* LA DISTINCTION QUI FAIT TOUT LE MODÈLE. « votre prix ✓ » quand le
              conducteur a accepté ce qu'on proposait ; « contre-offre » quand
              il en demande un autre. Deux couleurs, parce que deux décisions
              différentes : l'une se confirme, l'autre se pèse. */}
          <Text
            className={`mt-1 text-[10px] font-bold ${
              contreOffre ? 'text-danger' : 'text-accInk'
            }`}
          >
            {contreOffre ? t('offres.contreOffre') : t('offres.votrePrixCoche')}
          </Text>
        </View>
      </View>

      {/* Entre deux filets : le délai d'approche et le temps qu'il reste à
          CETTE offre. La maquette portait une distance à la place du second —
          elle n'existe pas dans les données, et elle ne doit pas exister : la
          position d'un conducteur n'est servie qu'APRÈS acceptation. */}
      <View className="my-12 border-y border-line py-8">
        <Text className="text-[12px] font-semibold text-muted">
          <Text className="font-bold text-ink">
            {t('offres.minutes', { n: offre.delai_arrivee_min ?? 0 })}
          </Text>
          {` ${t('offres.delaiApproche')}`}
        </Text>
      </View>

      {disponible ? (
        <View className="flex-row gap-8">
          <Action
            nom="accepter"
            /* Le montant sur le bouton quand il DIFFÈRE de ce qu'on a proposé :
               c'est la dernière occasion de voir ce qu'on accepte. */
            texte={
              contreOffre
                ? t('offres.accepterA', { prix: formatXof(prix) })
                : t('offres.accepter')
            }
            principale
            desactive={desactive}
            occupe={occupe}
            onPress={onAccepter}
          />
          <Action
            nom="refuser"
            texte="✕"
            etroit
            desactive={desactive}
            occupe={occupe}
            onPress={onRefuser}
          />
        </View>
      ) : (
        <Text className="text-[13px] font-semibold text-muted">
          {offre.statut === 'caduque'
            ? t('offres.caduque')
            : offre.statut === 'refusee'
              ? t('offres.refusee')
              : offre.statut === 'acceptee'
                ? t('offres.acceptee')
                : t('offres.demandeExpiree')}
        </Text>
      )}
    </View>
  );
}

function Action({
  nom,
  texte,
  principale = false,
  etroit = false,
  desactive,
  occupe,
  onPress,
}: {
  nom: string;
  texte: string;
  principale?: boolean;
  /** Le refus. Étroit, sans texte : il ne doit pas concurrencer l'accepter. */
  etroit?: boolean;
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
      className={`min-h-touch items-center justify-center rounded-field ${
        etroit ? 'w-48 border-2 border-line' : 'flex-1'
      } ${actif && principale ? 'bg-accFill' : etroit ? '' : 'bg-card2'}`}
      style={({ pressed }) => ({ opacity: pressed && actif ? 0.7 : 1 })}
    >
      <Text
        className={`text-[14px] font-bold ${
          actif ? (principale ? 'text-onAcc' : 'text-muted') : 'text-muted'
        }`}
      >
        {texte}
      </Text>
    </Pressable>
  );
}

function Bandeau({
  texte,
  danger = false,
}: {
  texte: string;
  danger?: boolean;
}) {
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
      <Text className="text-center text-[15px] font-semibold text-muted">
        {texte}
      </Text>
      {action && onPress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill px-24"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[15px] font-extrabold text-onAcc">
            {action}
          </Text>
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
