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
const GABARIT = { vehicule: 96, photo: 96, piece1: 64, bouton: 48, action: 48 };

export default function DevenirConducteur() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const dossier = useDossier();
  const session = useSession();
  const monId = session.statut === 'connecte' ? session.session.user.id : null;
  const moi = useProfilPublic(monId);
  const auto = useVehicule();
  const capacite = useEstConducteur();

  const [enCours, setEnCours] = useState<TypeDocument | 'photo' | null>(null);
  const [erreurEnvoi, setErreurEnvoi] = useState<string | null>(null);
  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  configurerGabarit('dossier', GABARIT);

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
  const valides = dossier.documents.filter((d) => d.statut === 'valide').length;
  const manquantes = PIECES.filter((p) => !parType.has(p)).length;

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
            onPress={() => router.back()}
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
              <Encart
                titre={t('dossier.complet')}
                aide={t('dossier.completAide')}
              />
            ) : valides === PIECES.length && !auto.vehicule ? (
              // Le piège : quatre pièces validées et pas de voiture déclarée.
              // Annoncer « complet » ici, c'est envoyer quelqu'un chercher un
              // mode conducteur qui n'apparaîtra pas.
              <Encart
                titre={t('dossier.vehiculeManquant')}
                aide={t('dossier.vehiculeManquantAide')}
              />
            ) : manquantes === 0 ? (
              <Encart
                titre={t('dossier.enCours')}
                aide={t('dossier.enCoursAide')}
              />
            ) : (
              <Encart
                titre={
                  manquantes === 1
                    ? t('dossier.manquant', { n: manquantes })
                    : t('dossier.manquantPluriel', { n: manquantes })
                }
              />
            )}

            {erreurEnvoi ? <Bandeau texte={erreurEnvoi} danger /> : null}

            {/* La photo de profil n'est PAS une pièce du dossier : elle ne se
                valide pas, elle s'affiche. Elle va dans un autre dépôt, avec
                d'autres droits — la confondre avec un permis ouvrirait la
                lecture des permis à tous les connectés. */}
            <Photo
              nom="photo"
              chemin={moi?.photo_url ?? null}
              prenom={moi?.prenom ?? null}
              occupe={enCours === 'photo'}
              gele={horsLigne || (enCours !== null && enCours !== 'photo')}
              onDeposer={() => void deposer('photo')}
            />

            {/* Le véhicule : sans lui, quatre pièces validées n'ouvrent RIEN —
                `est_conducteur()` demande les deux. L'écran le disait ouvert ;
                il ne l'était pas. */}
            {/* Le véhicule arrive après un aller-retour. La `key` remonte le
                bloc quand il tombe : les champs partent alors des valeurs déjà
                déclarées, sans effet qui recopie des props dans un état. */}
            <Vehicule
              key={auto.vehicule?.id ?? 'neuf'}
              nom="vehicule"
              vehicule={auto.vehicule}
              gele={horsLigne || enCours !== null}
              onEnregistre={() => auto.relire()}
            />

            {PIECES.map((type, i) => (
              <Piece
                key={type}
                nom={`piece${i + 1}`}
                titre={t(`dossier.${type}`)}
                aide={t(`dossier.${type}Aide`)}
                document={parType.get(type) ?? null}
                occupe={enCours === type}
                gele={horsLigne || (enCours !== null && enCours !== type)}
                onDeposer={() => void deposer(type)}
              />
            ))}
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
