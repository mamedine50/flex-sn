import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../src/i18n';
import {
  deciderPiece,
  urlPiece,
  useDossier,
  useCandidat,
  type Piece,
  type TypeDocument,
} from '../../src/lib/admin';
import { cleErreur } from '../../src/lib/erreursServeur';
import { PIECES } from '../../src/lib/documents';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { useUrlPhoto } from '../../src/lib/photos';
import { useGardeSession } from '../../src/lib/garde';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Un dossier, pièce par pièce.
 *
 * LA comparaison qui fait la validation est en tête : le selfie TENANT LE
 * PERMIS, le permis seul, et la photo de profil. Les trois ensemble, parce
 * qu'aucune ne suffit — le selfie prouve la possession, le permis donne le nom
 * et la photo officielle, et le profil est ce que les passagers verront. Un
 * écran qui oblige à faire défiler entre elles ne sert à rien : on ne compare
 * pas des visages de mémoire.
 *
 * Les URL sont signées dix minutes. Le dépôt reste privé ; c'est une policy de
 * stockage qui autorise l'admin, pas un contournement côté client.
 */

// 200 pour la rangée de trois : c'est la hauteur en dessous de laquelle un
// visage n'est plus comparable. L'assertion l'a prouvé une fois — trois
// vignettes à 120 rendaient 137, et personne ne l'aurait vu sur une capture.
const GABARIT = { comparaison: 200, action: 48 };

// « Le visage ne correspond pas » est le motif du selfie tenant le permis :
// c'est le refus qui compte, celui qui dit qu'on a affaire à quelqu'un d'autre.
// Sans lui dans la liste, l'admin l'aurait écrit à la main, différemment à
// chaque fois, et on n'aurait pas pu les compter.
const MOTIFS = [
  'motifIllisible',
  'motifExpiree',
  'motifNeCorrespondPas',
  'motifVisageDifferent',
  'motifAutre',
] as const;

export default function DossierAdmin() {
  const t = useT();
  useGardeSession('/admin');

  const marges = useSafeAreaInsets();
  const { couleurs } = useTheme();
  const { profil } = useLocalSearchParams<{ profil: string }>();

  const { pieces, statut, relire } = useDossier(profil);
  // L'identité vient de `candidat_admin`, pas de la file : la file se vide dès
  // que tout est décidé, et l'écran perdait alors le nom et le véhicule sous les
  // yeux de celui qui venait de trancher.
  const entree = useCandidat(profil);

  const [urls, setUrls] = useState<Record<string, string | null>>({});

  // La photo de profil vit dans un AUTRE seau que les pièces : elle a son
  // propre chemin signé. C'est celle que les passagers verront — la comparer
  // aux deux autres est le seul moyen de s'assurer qu'ils verront la bonne
  // personne.
  const photoProfil = useUrlPhoto(entree?.photo_url);
  const [refus, setRefus] = useState<TypeDocument | null>(null);
  const [motif, setMotif] = useState<(typeof MOTIFS)[number] | null>(null);
  const [precision, setPrecision] = useState('');
  const [occupe, setOccupe] = useState<TypeDocument | null>(null);
  const [echec, setEchec] = useState<string | null>(null);

  configurerGabarit('admin-dossier', GABARIT);

  // Les URL signées, une par pièce. Dix minutes suffisent à regarder un dossier.
  useEffect(() => {
    const vivant = { annule: false };
    void (async () => {
      const paires = await Promise.all(
        pieces.map(async (p) => [p.type, await urlPiece(p.chemin)] as const),
      );
      if (vivant.annule) return;
      setUrls(Object.fromEntries(paires));
    })();
    return () => {
      vivant.annule = true;
    };
  }, [pieces]);

  const parType = new Map(pieces.map((p) => [p.type, p]));

  const decider = async (type: TypeDocument, valide: boolean, texte?: string) => {
    setOccupe(type);
    setEchec(null);
    const { error } = await deciderPiece(profil, type, valide, texte);
    setOccupe(null);
    setRefus(null);
    setMotif(null);
    setPrecision('');
    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    relire();
  };

  /** Ce qui empêche encore la conduite, nommé plutôt que compté. */
  const manquantes = PIECES.filter(
    (type) => (parType.get(type)?.statut ?? null) !== 'valide',
  ).map((type) => t(`dossier.${type}`));

  const motifFinal =
    motif === 'motifAutre' ? precision.trim() : motif ? t(`admin.${motif}`) : '';
  const refusPossible = motifFinal.length >= 3;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1 px-16"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="flex-1 text-[22px] font-extrabold text-ink" numberOfLines={1}>
            {t('admin.dossier', { prenom: entree?.prenom ?? '' })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/admin'))}
            onLayout={(e) => noterMesure('action', e.nativeEvent.layout.height)}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        {statut === 'chargement' ? (
          <View className="mt-24 items-center">
            <ActivityIndicator />
          </View>
        ) : (
          <>
            {/* LA COMPARAISON QUI COMPTE. Trois images, côte à côte, en tête.
                Le selfie TIENT LE PERMIS : c'est ce qui prouve que le candidat
                est le titulaire, et pas quelqu'un qui a photographié le permis
                d'un autre. Sans le permis seul à côté, on ne peut pas lire le
                nom ni la photo officielle ; sans la photo de profil, on ne sait
                pas qui les passagers verront. Les trois, ou la vérification ne
                vaut rien. */}
            <Text className="mt-16 text-[12px] font-bold uppercase tracking-wider text-muted">
              {t('admin.comparez')}
            </Text>
            <Text className="mt-4 text-[13px] font-semibold text-muted">
              {t('admin.comparezAide')}
            </Text>
            <View
              className="mt-8 flex-row gap-8"
              onLayout={(e) => noterMesure('comparaison', e.nativeEvent.layout.height)}
            >
              {(
                [
                  ['selfie', t('admin.selfieCourt'), urls.selfie ?? null],
                  ['permis', t('admin.permisCourt'), urls.permis ?? null],
                  ['profil', t('admin.profilCourt'), photoProfil],
                ] as const
              ).map(([cle, legende, uri]) => (
                <View key={cle} className="flex-1">
                  <Vignette titre={legende} uri={uri} comparaison montrerTitre={false} />
                  <Text
                    className="mt-4 text-center text-[11px] font-bold text-muted"
                    numberOfLines={1}
                  >
                    {legende}
                  </Text>
                </View>
              ))}
            </View>

            {/* LE VERDICT, EN TÊTE. Un administrateur tranche pièce par pièce
                et n'a nulle part où lire le RÉSULTAT de ce qu'il vient de
                faire : la conduite est-elle ouverte, et sinon que manque-t-il ?
                Il fallait le déduire en recomptant les pastilles. */}
            <View
              className={`mt-16 rounded-card p-16 ${
                entree?.est_conducteur ? 'bg-card' : 'bg-card2'
              }`}
            >
              <Text
                className={`text-[15px] font-extrabold ${
                  entree?.est_conducteur ? 'text-ok' : 'text-ink'
                }`}
              >
                {entree?.est_conducteur
                  ? t('admin.verdictOuvert')
                  : t('admin.verdictFerme')}
              </Text>
              {!entree?.est_conducteur ? (
                <Text className="mt-4 text-[13px] font-semibold text-muted">
                  {manquantes.length > 0
                    ? t('admin.verdictManque', { pieces: manquantes.join(', ') })
                    : !entree?.plaque
                      ? t('admin.verdictSansVehicule')
                      : t('admin.verdictEnAttente')}
                </Text>
              ) : null}
            </View>

            {/* Le véhicule : sans lui, valider les cinq pièces n'ouvre rien. */}
            <Text className="mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
              {t('admin.vehicule')}
            </Text>
            <View className="mt-8 rounded-card bg-card p-16">
              {entree?.plaque ? (
                <>
                  <Text className="text-[17px] font-extrabold text-ink">
                    {entree.plaque}
                  </Text>
                  <Text className="mt-2 text-[13px] font-semibold text-muted">
                    {entree.modele} {entree.couleur}
                  </Text>
                </>
              ) : (
                <Text className="text-[13px] font-bold text-danger">
                  {t('admin.aucunVehicule')}
                </Text>
              )}
            </View>

            {echec ? (
              <View className="mt-12 rounded-field bg-card px-16 py-12">
                <Text className="text-[13px] font-bold text-danger">{echec}</Text>
              </View>
            ) : null}

            {(
              [
                'piece_identite',
                'permis',
                'carte_grise',
                'selfie',
                'photo_vehicule',
              ] as TypeDocument[]
            ).map(
              (type) => (
                <PieceAdmin
                  key={type}
                  titre={t(`dossier.${type}`)}
                  piece={parType.get(type) ?? null}
                  uri={urls[type] ?? null}
                  occupe={occupe === type}
                  onValider={() => void decider(type, true)}
                  onRefuser={() => {
                    setRefus(type);
                    setMotif(null);
                    setPrecision('');
                  }}
                />
              ),
            )}
          </>
        )}
      </ScrollView>

      {/* Le motif : liste courte, et un texte libre seulement pour « autre ». */}
      <Modal visible={refus !== null} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setRefus(null)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('admin.motifTitre')}
            </Text>

            {MOTIFS.map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: motif === m }}
                onPress={() => setMotif(m)}
                className={`mt-8 min-h-touch justify-center rounded-field px-16 ${
                  motif === m ? 'bg-accFill' : 'bg-card2'
                }`}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text
                  className={`text-[14px] font-bold ${
                    motif === m ? 'text-onAcc' : 'text-ink'
                  }`}
                >
                  {t(`admin.${m}`)}
                </Text>
              </Pressable>
            ))}

            {motif === 'motifAutre' ? (
              <TextInput
                value={precision}
                onChangeText={(v) => setPrecision(v.slice(0, 300))}
                autoFocus
                placeholder={t('admin.motifPrecisez')}
                placeholderTextColor={couleurs.muted}
                accessibilityLabel={t('admin.motifPrecisez')}
                className="mt-8 min-h-touch rounded-field bg-card2 px-12 text-[15px] font-semibold text-ink"
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={!refusPossible}
              onPress={() => refus && void decider(refus, false, motifFinal)}
              className={`mt-16 min-h-driving items-center justify-center rounded-button ${
                refusPossible ? 'bg-card2' : 'bg-bg'
              }`}
              style={({ pressed }) => ({ opacity: pressed && refusPossible ? 0.7 : 1 })}
            >
              <Text
                className={`text-[15px] font-extrabold ${
                  refusPossible ? 'text-danger' : 'text-muted'
                }`}
              >
                {t('admin.confirmerRefus')}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setRefus(null)}
              className="mt-8 min-h-driving items-center justify-center rounded-button bg-accFill"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-onAcc">
                {t('commun.annuler')}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Une pièce en image.
 *
 * PAS de `flex-1` ici : posée seule dans une colonne, une vignette en `flex-1`
 * s'effondre à zéro et les boutons se dessinent par-dessus. C'est l'appelant
 * qui décide de la largeur — la rangée de comparaison enveloppe chaque vignette
 * dans son propre `flex-1`.
 */
/**
 * Trois hauteurs, et le portrait n'est pas un caprice.
 *
 * `comparaison` sert la rangée de trois : un visage se compare EN HAUTEUR. À
 * trois de front, la largeur d'une vignette tombe à un tiers de l'écran — si on
 * garde une boîte large et basse, il ne reste du visage qu'une bande. Le
 * portrait rend au visage la place qu'il lui faut sans déborder en largeur.
 * L'assertion de gabarit a attrapé exactement ça : 137 pt là où il en faut 200.
 */
function Vignette({
  titre,
  uri,
  grande = false,
  comparaison = false,
  montrerTitre = true,
}: {
  titre: string;
  uri: string | null;
  grande?: boolean;
  comparaison?: boolean;
  /** Faux dans une carte de pièce : le titre y est déjà, une ligne plus haut. */
  montrerTitre?: boolean;
}) {
  const t = useT();
  return (
    <View className="w-full">
      {montrerTitre ? (
        <Text className="mb-4 text-[12px] font-bold text-muted">{titre}</Text>
      ) : null}
      {uri ? (
        <Image
          source={{ uri }}
          // `contain`, pas `cover`. Une carte grise est large, un permis est en
          // travers : rogner au centre coupe précisément le numéro et la date
          // qu'on doit lire. Mieux vaut des marges que de décider sur un
          // document dont on ne voit que le milieu.
          resizeMode="contain"
          accessibilityLabel={titre}
          className={`w-full rounded-card bg-card2 ${
            grande ? 'h-[220px]' : comparaison ? 'h-[200px]' : 'h-[120px]'
          }`}
        />
      ) : (
        <View
          className={`w-full items-center justify-center rounded-card bg-card2 ${
            grande ? 'h-[220px]' : comparaison ? 'h-[200px]' : 'h-[120px]'
          }`}
        >
          <Text className="px-8 text-center text-[12px] font-semibold text-muted">
            {t('admin.imageIndisponible')}
          </Text>
        </View>
      )}
    </View>
  );
}

function PieceAdmin({
  titre,
  piece,
  uri,
  occupe,
  onValider,
  onRefuser,
}: {
  titre: string;
  piece: Piece | null;
  uri: string | null;
  occupe: boolean;
  onValider: () => void;
  onRefuser: () => void;
}) {
  const t = useT();
  const statut = piece?.statut ?? null;

  return (
    <View className="mt-12 rounded-card bg-card p-16">
      <View className="flex-row items-start">
        <Text className="flex-1 text-[15px] font-bold text-ink">{titre}</Text>
        {statut ? (
          <Text
            className={`text-[12px] font-bold ${
              statut === 'valide'
                ? 'text-ok'
                : statut === 'refuse'
                  ? 'text-danger'
                  : 'text-accInk'
            }`}
          >
            {t(`dossier.${statut}`)}
          </Text>
        ) : null}
      </View>

      {piece?.motif_refus ? (
        <Text className="mt-4 text-[13px] font-semibold text-danger">
          {piece.motif_refus}
        </Text>
      ) : null}

      <View className="mt-8">
        <Vignette titre={titre} uri={uri} montrerTitre={false} />
      </View>

      {/* UNE PIÈCE DÉCIDÉE NE SE REDÉCIDE PAS ICI. Les deux boutons restaient
          après la décision : rien ne disait qu'elle avait été prise, et deux
          appuis de suite écrivaient deux lignes au journal pour un seul avis.
          La décision est portée par le statut en haut de la carte, et par le
          motif quand c'est un refus. Pour revenir dessus, le candidat redépose
          — c'est le seul chemin, et il efface le motif précédent. */}
      {statut === 'en_attente' ? (
        <View className="mt-12 flex-row gap-8">
          <Pressable
            accessibilityRole="button"
            disabled={occupe}
            onPress={onValider}
            className={`min-h-touch flex-1 items-center justify-center rounded-field ${
              occupe ? 'bg-bg' : 'bg-accFill'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text
              className={`text-[14px] font-extrabold ${occupe ? 'text-muted' : 'text-onAcc'}`}
            >
              {occupe ? t('admin.decisionEnCours') : t('admin.valider')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={occupe}
            onPress={onRefuser}
            className="min-h-touch flex-1 items-center justify-center rounded-field bg-card2"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[14px] font-bold text-danger">{t('admin.refuser')}</Text>
          </Pressable>
        </View>
      ) : statut === 'valide' ? (
        // Rien de plus. Une pièce validée n'appelle aucune action, et lui
        // coller « le candidat doit redéposer » sous le nez — ce que faisait
        // l'ancienne phrase, la MÊME pour les deux issues — laissait croire
        // qu'elle avait été refusée.
        null
      ) : statut === 'refuse' ? (
        <Text className="mt-12 text-[13px] font-semibold text-muted">
          {t('admin.dejaRefusee')}
        </Text>
      ) : null}
    </View>
  );
}
