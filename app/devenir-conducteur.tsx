import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import { useTheme } from '../src/theme/ThemeProvider';
import {
  deposerPiece,
  PIECES,
  useDossier,
  type Document,
  type TypeDocument,
} from '../src/lib/documents';
import { useGardeSession } from '../src/lib/garde';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { deposerPhotoProfil } from '../src/lib/photos';
import { useProfilPublic } from '../src/lib/profilPublic';
import { useEstConducteur } from '../src/lib/conducteur';
import { useSession } from '../src/lib/session';
import { declarerVehicule, useVehicule } from '../src/lib/vehicule';

/**
 * Devenir conducteur.
 *
 * Quatre pièces, et un STATUT VISIBLE pour chacune. Un dossier muet pendant
 * trois semaines, c'est un conducteur qui abandonne — et des conducteurs, on
 * n'en a pas à perdre.
 *
 * Un refus porte toujours son motif : la base l'exige (`motif_requis`), l'écran
 * l'affiche. « Refusé », seul, ne se corrige pas.
 */

// `piece1` est la carte d'une pièce déjà validée : plus de bouton, donc plus
// courte. Le bouton se mesure à part, là où il existe toujours.
/**
 * Les étapes, dans l'ordre où on les demande.
 *
 * LA PHOTO DE PROFIL D'ABORD : c'est la plus facile, elle ne demande aucun
 * papier, et elle met le pied à l'étrier. Puis les papiers qu'on a déjà en
 * poche. Puis les deux photos à PRENDRE — le selfie tenant le permis, la
 * voiture. Puis les champs du véhicule, qui se tapent. Finir par le plus dur
 * fait abandonner à la première étape.
 */
type Etape =
  | { genre: 'photo' }
  | { genre: 'piece'; type: TypeDocument }
  | { genre: 'vehicule' }
  | { genre: 'recap' };

const ETAPES: Etape[] = [
  { genre: 'photo' },
  ...PIECES.map((type) => ({ genre: 'piece' as const, type })),
  { genre: 'vehicule' },
  { genre: 'recap' },
];

/**
 * UN GABARIT PAR ÉTAPE, et ce n'est pas du zèle.
 *
 * Une seule étape est à l'écran : une assertion qui attendrait à la fois la
 * photo, une pièce et le véhicule n'aurait JAMAIS toutes ses mesures, et ne se
 * prononcerait donc jamais. Elle passerait pour verte en ne disant rien. Le
 * découpage est ce qui la rend capable d'échouer.
 */
const GABARIT: Record<Etape['genre'], Record<string, number>> = {
  photo: { action: 48, photo: 96, continuer: 56 },
  piece: { action: 48, piece1: 64, continuer: 56 },
  vehicule: { action: 48, vehicule: 96, bouton: 48 },
  recap: { action: 48 },
};

export default function DevenirConducteur() {
  const t = useT();
  // Cet écran écrit : sans session, il n'a rien à montrer. La garde
  // emporte le chemin, et la connexion y revient.
  useGardeSession('/devenir-conducteur');
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const dossier = useDossier();
  const session = useSession();
  const monId = session.statut === 'connecte' ? session.session.user.id : null;
  const moi = useProfilPublic(monId);
  const auto = useVehicule();
  const capacite = useEstConducteur();

  const [enCours, setEnCours] = useState<TypeDocument | 'photo' | null>(null);
  const [indexEtape, setIndexEtape] = useState(0);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);


  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;
  const statut =
    etatForce === 'dossier_chargement'
      ? 'chargement'
      : etatForce === 'dossier_erreur'
        ? 'erreur'
        : dossier.statut;

  const deposer = async (type: TypeDocument | 'photo') => {
    setEnCours(type);
    setErreurEnvoi(null);
    const resultat =
      type === 'photo' ? await deposerPhotoProfil() : await deposerPiece(type);
    setEnCours(null);

    if (!resultat.ok) {
      // Une annulation n'est pas un échec : l'utilisateur a fermé la galerie.
      if (resultat.cle === 'annule') return;
      setErreurEnvoi(
        resultat.cle === 'permission'
          ? t('dossier.erreurPermission')
          : t('dossier.erreurEnvoi'),
      );
      return;
    }
    dossier.relire();
  };

  const parType = new Map(dossier.documents.map((d) => [d.type, d]));

  const etape: Etape = ETAPES[indexEtape] ?? { genre: 'photo' };

  configurerGabarit(
    indexEtape === 0 ? 'dossier' : `dossier+${etape.genre}`,
    GABARIT[etape.genre],
  );

  /**
   * L'étape est-elle franchie ? Une pièce REFUSÉE ne l'est pas : on ne saute
   * pas par-dessus un refus, on redépose. C'est tout l'intérêt du parcours par
   * étapes — un refus au milieu d'une longue liste passe inaperçu.
   */
  const document =
    etape.genre === 'piece' ? (parType.get(etape.type) ?? null) : null;
  const etapeFaite =
    etape.genre === 'photo'
      ? Boolean(moi?.photo_url)
      : etape.genre === 'vehicule'
        ? Boolean(auto.vehicule)
        : etape.genre === 'piece'
          ? document !== null && document.statut !== 'refuse'
          : true;

  const blocage =
    etape.genre === 'photo'
      ? t('dossier.blocagePhoto')
      : etape.genre === 'vehicule'
        ? t('dossier.blocageVehicule')
        : document?.statut === 'refuse'
          ? t('dossier.blocageRefus')
          : t('dossier.blocagePiece');

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
          <Pressable
            onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
            className="min-h-touch flex-1 justify-center"
          >
            <Text className="text-[22px] font-extrabold text-ink">
              {t('dossier.titre')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="min-h-touch justify-center pl-16"
            onLayout={(e) => noterMesure('action', e.nativeEvent.layout.height)}
          >
            <Text className="text-[15px] font-bold text-accInk">
              {t('commun.retour')}
            </Text>
          </Pressable>
        </View>

        <Text className="mt-8 text-[14px] font-semibold text-muted">
          {t('dossier.intro')}
        </Text>

        {/* Le modèle économique, annoncé AVANT que la personne envoie sa pièce
            d'identité. C'est le moment où elle s'engage — pas six mois plus
            tard, quand la commission tombe. */}
        <View className="mt-12 rounded-card bg-card p-16">
          <Text className="text-[14px] font-bold text-ok">
            {t('profil.gainsCommission')}
          </Text>
          <Text className="mt-4 text-[12px] font-semibold text-muted">
            {t('profil.commissionApres')}
          </Text>
        </View>

        {horsLigne ? <Bandeau texte={t('dossier.horsLigne')} /> : null}

        {statut === 'chargement' ? (
          <View className="mt-24 items-center">
            <ActivityIndicator />
            <Text className="mt-8 text-[13px] font-semibold text-muted">
              {t('commun.chargement')}
            </Text>
          </View>
        ) : statut === 'erreur' ? (
          <>
            <Encart
              titre={t('dossier.illisible')}
              aide={t('dossier.illisibleAide')}
              danger
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => dossier.relire()}
              className="mt-12 min-h-touch items-center justify-center rounded-field bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[14px] font-bold text-accInk">
                {t('commun.reessayer')}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            {capacite === 'oui' ? (
              <Encart titre={t('dossier.complet')} aide={t('dossier.completAide')} />
            ) : (
              <>
                {/* UNE ÉTAPE À LA FOIS. La liste complète décourageait : sept
                    demandes d'un coup, on referme. Une seule question à
                    l'écran, et le compteur dit qu'elle finit. */}
                <View className="mt-16 flex-row items-center justify-between">
                  <Text className="text-[12px] font-bold uppercase tracking-wider text-accInk">
                    {t('dossier.etape', {
                      n: indexEtape + 1,
                      total: ETAPES.length,
                    })}
                  </Text>
                  {indexEtape > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setIndexEtape((i) => Math.max(0, i - 1))}
                      className="min-h-touch justify-center pl-16"
                      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    >
                      <Text className="text-[13px] font-bold text-muted">
                        {t('dossier.precedente')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {/* La barre d'avancement : elle dit ce qui reste, pas ce qui
                    est fait. C'est ce qui décide si on continue. */}
                <View className="mt-8 h-8 flex-row gap-4">
                  {ETAPES.map((_, i) => (
                    <View
                      key={i}
                      className={`h-8 flex-1 rounded-full ${
                        i <= indexEtape ? 'bg-accFill' : 'bg-card2'
                      }`}
                    />
                  ))}
                </View>

                {erreurEnvoi ? <Bandeau texte={erreurEnvoi} danger /> : null}

                {etape.genre === 'photo' ? (
                  <Photo
                    nom="photo"
                    chemin={moi?.photo_url ?? null}
                    prenom={moi?.prenom ?? null}
                    occupe={enCours === 'photo'}
                    gele={horsLigne || (enCours !== null && enCours !== 'photo')}
                    onDeposer={() => void deposer('photo')}
                  />
                ) : etape.genre === 'vehicule' ? (
                  <Vehicule
                    key={auto.vehicule?.id ?? 'neuf'}
                    nom="vehicule"
                    vehicule={auto.vehicule}
                    gele={horsLigne || enCours !== null}
                    onEnregistre={() => auto.relire()}
                  />
                ) : etape.genre === 'piece' ? (
                  <Piece
                    nom="piece1"
                    titre={t(`dossier.${etape.type}`)}
                    aide={t(`dossier.${etape.type}Aide`)}
                    document={parType.get(etape.type) ?? null}
                    occupe={enCours === etape.type}
                    gele={horsLigne || (enCours !== null && enCours !== etape.type)}
                    onDeposer={() => void deposer(etape.type)}
                  />
                ) : (
                  <Recapitulatif
                    pieces={PIECES.map((type) => ({
                      titre: t(`dossier.${type}`),
                      document: parType.get(type) ?? null,
                    }))}
                    vehicule={auto.vehicule}
                    onCorriger={setIndexEtape}
                  />
                )}

                {/* ON N'AVANCE PAS TANT QUE L'ÉTAPE N'EST PAS FAITE, et le
                    bouton dit POURQUOI plutôt que de rester gris. Une pièce
                    refusée renvoie ici : on ne saute pas par-dessus un refus. */}
                {etape.genre !== 'recap' ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !etapeFaite }}
                      disabled={!etapeFaite}
                      onPress={() =>
                        setIndexEtape((i) => Math.min(ETAPES.length - 1, i + 1))
                      }
                      onLayout={(e) =>
                        noterMesure('continuer', e.nativeEvent.layout.height)
                      }
                      className={`mt-16 min-h-driving items-center justify-center rounded-button ${
                        etapeFaite ? 'bg-accFill' : 'bg-card2'
                      }`}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <Text
                        className={`text-[15px] font-extrabold ${
                          etapeFaite ? 'text-onAcc' : 'text-muted'
                        }`}
                      >
                        {t('dossier.continuer')}
                      </Text>
                    </Pressable>
                    {!etapeFaite ? (
                      <Text className="mt-8 text-center text-[12px] font-semibold text-muted">
                        {blocage}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      {__DEV__ ? (
        <PanneauDev
          visible={panneauOuvert}
          actuel={etatForce}
          onChoisir={setEtatForce}
          onFermer={() => setPanneauOuvert(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * Le récapitulatif, avant d'envoyer.
 *
 * Il ne rejoue pas les étapes : il dit ce qui est là et ce qui manque, et il
 * ramène d'un appui sur ce qui manque. Un récapitulatif qu'on ne peut pas
 * corriger sur place oblige à tout reparcourir, et c'est là qu'on abandonne.
 */
function Recapitulatif({
  pieces,
  vehicule,
  onCorriger,
}: {
  pieces: { titre: string; document: Document | null }[];
  vehicule: { plaque: string; modele: string; couleur: string } | null;
  onCorriger: (index: number) => void;
}) {
  const t = useT();

  return (
    <View className="mt-16">
      <Text className="text-[17px] font-extrabold text-ink">
        {t('dossier.recapTitre')}
      </Text>
      <Text className="mt-4 text-[13px] font-semibold text-muted">
        {t('dossier.recapAide')}
      </Text>

      {pieces.map((p, i) => (
        <Ligne
          key={p.titre}
          titre={p.titre}
          etat={
            p.document === null
              ? t('dossier.recapManque')
              : t(`dossier.${p.document.statut}`)
          }
          manque={p.document === null || p.document.statut === 'refuse'}
          onCorriger={() => onCorriger(i + 1)}
        />
      ))}

      <Ligne
        titre={t('dossier.vehicule')}
        etat={
          vehicule
            ? `${vehicule.plaque} · ${vehicule.modele} ${vehicule.couleur}`
            : t('dossier.recapManque')
        }
        manque={!vehicule}
        onCorriger={() => onCorriger(ETAPES.length - 2)}
      />
    </View>
  );
}

function Ligne({
  titre,
  etat,
  manque,
  onCorriger,
}: {
  titre: string;
  etat: string;
  manque: boolean;
  onCorriger: () => void;
}) {
  const t = useT();
  return (
    <View className="mt-8 flex-row items-center rounded-card bg-card p-16">
      <View className="flex-1 pr-12">
        <Text className="text-[14px] font-bold text-ink" numberOfLines={1}>
          {titre}
        </Text>
        <Text
          className={`mt-2 text-[12px] font-semibold ${
            manque ? 'text-danger' : 'text-muted'
          }`}
          numberOfLines={1}
        >
          {etat}
        </Text>
      </View>
      {manque ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCorriger}
          className="min-h-touch justify-center pl-12"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Text className="text-[13px] font-bold text-accInk">
            {t('dossier.recapCorriger')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Bandeau({ texte, danger = false }: { texte: string; danger?: boolean }) {
  return (
    <View className="mt-12 rounded-field bg-card px-16 py-12">
      <Text
        className={`text-[13px] font-semibold ${danger ? 'text-danger' : 'text-ink'}`}
      >
        {texte}
      </Text>
    </View>
  );
}

function Encart({
  titre,
  aide,
  danger = false,
}: {
  titre: string;
  aide?: string;
  danger?: boolean;
}) {
  return (
    <View className="mt-16 rounded-card bg-card p-16">
      <Text
        className={`text-[15px] font-bold ${danger ? 'text-danger' : 'text-ink'}`}
      >
        {titre}
      </Text>
      {aide ? (
        <Text className="mt-4 text-[13px] font-semibold text-muted">{aide}</Text>
      ) : null}
    </View>
  );
}

function Vehicule({
  nom,
  vehicule,
  gele,
  onEnregistre,
}: {
  nom: string;
  vehicule: { plaque: string; modele: string; couleur: string } | null;
  gele: boolean;
  onEnregistre: () => void;
}) {
  const t = useT();
  const { couleurs } = useTheme();

  const [plaque, setPlaque] = useState(vehicule?.plaque ?? '');
  const [modele, setModele] = useState(vehicule?.modele ?? '');
  const [couleur, setCouleur] = useState(vehicule?.couleur ?? '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  const complet =
    plaque.trim().length >= 4 && modele.trim().length >= 2 && couleur.trim().length >= 2;

  const enregistrer = async () => {
    setOccupe(true);
    setErreur(null);
    const resultat = await declarerVehicule(plaque, modele, couleur);
    setOccupe(false);
    if (!resultat.ok) {
      setErreur(t(resultat.cle as never));
      return;
    }
    setEnregistre(true);
    onEnregistre();
  };

  return (
    <View
      className="mt-12 rounded-card bg-card p-16"
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
    >
      <View className="flex-row items-center">
        <View className="flex-1 pr-12">
          <Text className="text-[15px] font-bold text-ink">{t('dossier.vehicule')}</Text>
          <Text className="mt-2 text-[12px] font-semibold text-muted">
            {t('dossier.vehiculeAide')}
          </Text>
        </View>
        {vehicule || enregistre ? (
          <Text className="text-[12px] font-bold text-ok">
            {t('dossier.vehiculeEnregistre')}
          </Text>
        ) : null}
      </View>

      <Champ
        etiquette={t('dossier.plaque')}
        indice={t('dossier.plaquePlaceholder')}
        valeur={plaque}
        onChange={setPlaque}
        gele={gele || occupe}
        muted={couleurs.muted}
        majuscules
      />
      <Champ
        etiquette={t('dossier.modele')}
        indice={t('dossier.modelePlaceholder')}
        valeur={modele}
        onChange={setModele}
        gele={gele || occupe}
        muted={couleurs.muted}
      />
      <Champ
        etiquette={t('dossier.couleur')}
        indice={t('dossier.couleurPlaceholder')}
        valeur={couleur}
        onChange={setCouleur}
        gele={gele || occupe}
        muted={couleurs.muted}
      />

      {erreur ? (
        <Text className="mt-8 text-[13px] font-semibold text-danger">{erreur}</Text>
      ) : null}

      <Bouton
        occupe={occupe}
        gele={gele || !complet}
        onPress={() => void enregistrer()}
        texte={occupe ? t('dossier.envoiEnCours') : t('dossier.enregistrer')}
      />
    </View>
  );
}

function Champ({
  etiquette,
  indice,
  valeur,
  onChange,
  gele,
  muted,
  majuscules = false,
}: {
  etiquette: string;
  indice: string;
  valeur: string;
  onChange: (v: string) => void;
  gele: boolean;
  muted: string;
  majuscules?: boolean;
}) {
  return (
    <View className="mt-12">
      <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
        {etiquette}
      </Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        editable={!gele}
        placeholder={indice}
        placeholderTextColor={muted}
        autoCapitalize={majuscules ? 'characters' : 'none'}
        autoCorrect={false}
        className={`mt-4 min-h-touch rounded-field px-12 text-[15px] font-bold ${
          gele ? 'bg-bg text-muted' : 'bg-card2 text-ink'
        }`}
      />
    </View>
  );
}

function Photo({
  nom,
  chemin,
  prenom,
  occupe,
  gele,
  onDeposer,
}: {
  nom: string;
  chemin: string | null;
  prenom: string | null;
  occupe: boolean;
  gele: boolean;
  onDeposer: () => void;
}) {
  const t = useT();

  return (
    <View
      className="mt-12 rounded-card bg-card p-16"
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
    >
      <View className="flex-row items-center">
        {/* Jamais un rond vide : l'initiale colorée tient la place tant qu'il
            n'y a pas de photo. */}
        <Avatar prenom={prenom} photo={chemin} />
        <View className="ml-12 flex-1">
          <Text className="text-[15px] font-bold text-ink">{t('dossier.photo')}</Text>
          <Text className="mt-2 text-[12px] font-semibold text-muted">
            {t('dossier.photoAide')}
          </Text>
        </View>
        {chemin ? (
          <Text className="text-[12px] font-bold text-ok">{t('dossier.photoPosee')}</Text>
        ) : null}
      </View>

      <Bouton
        nom="bouton"
        occupe={occupe}
        gele={gele}
        onPress={onDeposer}
        texte={
          occupe
            ? t('dossier.envoiEnCours')
            : chemin
              ? t('dossier.remplacer')
              : t('dossier.ajouter')
        }
      />
    </View>
  );
}

function Piece({
  nom,
  titre,
  aide,
  document,
  occupe,
  gele,
  onDeposer,
}: {
  nom: string;
  titre: string;
  aide: string;
  document: Pick<Document, 'statut' | 'motif_refus'> | null;
  occupe: boolean;
  gele: boolean;
  onDeposer: () => void;
}) {
  const t = useT();
  const statut = document?.statut ?? null;

  return (
    <View
      className="mt-12 rounded-card bg-card p-16"
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
    >
      <View className="flex-row items-start">
        <View className="flex-1 pr-12">
          <Text className="text-[15px] font-bold text-ink">{titre}</Text>
          <Text className="mt-2 text-[12px] font-semibold text-muted">{aide}</Text>
        </View>

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

      {/* Un refus SANS motif ne se corrige pas. La base l'interdit, l'écran le
          montre. */}
      {document?.motif_refus ? (
        <Text className="mt-8 text-[13px] font-semibold text-danger">
          {document.motif_refus}
        </Text>
      ) : null}

      {statut !== 'valide' ? (
        <Bouton
          occupe={occupe}
          gele={gele}
          onPress={onDeposer}
          texte={
            occupe
              ? t('dossier.envoiEnCours')
              : statut
                ? t('dossier.remplacer')
                : t('dossier.ajouter')
          }
        />
      ) : null}
    </View>
  );
}

function Bouton({
  texte,
  occupe,
  gele,
  onPress,
  nom,
}: {
  texte: string;
  occupe: boolean;
  gele: boolean;
  onPress: () => void;
  nom?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: occupe, disabled: gele }}
      disabled={occupe || gele}
      onPress={onPress}
      onLayout={nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined}
      className={`mt-12 min-h-touch flex-row items-center justify-center rounded-field ${
        occupe || gele ? 'bg-bg' : 'bg-card2'
      }`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {occupe ? <ActivityIndicator className="mr-8" /> : null}
      {/* Un désactivé change de couleur : l'opacité seule laisserait un aplat
          clair lumineux sur fond sombre. */}
      <Text
        className={`text-[14px] font-bold ${occupe || gele ? 'text-muted' : 'text-accInk'}`}
      >
        {texte}
      </Text>
    </Pressable>
  );
}
