import { useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../src/components/Avatar';
import { useI18n, useT } from '../src/i18n';
import { cleErreur } from '../src/lib/erreursServeur';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';
import { majProfil, useMonProfil } from '../src/lib/monProfil';
import { deposerPhotoProfil } from '../src/lib/photos';
import { useSession } from '../src/lib/session';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * Mon profil.
 *
 * Le NUMÉRO s'affiche et ne se modifie pas : c'est l'identifiant de connexion,
 * en changer demande de re-vérifier par SMS, de gérer le cas du numéro déjà
 * pris, et de décider ce qu'il advient des courses passées. C'est un chantier,
 * pas un champ — et un champ qui ne marcherait qu'à moitié serait pire que son
 * absence.
 */

const GABARIT = { photo: 48, champ: 56, enregistrer: 56 };

export default function MonProfil() {
  const t = useT();
  const { langue } = useI18n();
  useGardeSession('/mon-profil');

  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const { couleurs } = useTheme();
  const session = useSession();
  const { profil, statut, relire } = useMonProfil();

  const [prenom, setPrenom] = useState<string | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<'repos' | 'photo' | 'texte'>('repos');
  const [echec, setEchec] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  configurerGabarit('mon-profil', GABARIT);

  const horsLigne = reseau.isInternetReachable === false;

  // Les champs partent de la base, et l'utilisateur reprend la main dès sa
  // première frappe. `null` veut dire « pas encore touché », pas « vide ».
  const valeurPrenom = prenom ?? profil?.prenom ?? '';
  const valeurNom = nom ?? profil?.nom_complet ?? '';

  // `??` ne rattrape pas la chaîne vide, et `auth.users.phone` vaut '' pour un
  // compte créé par courriel : la ligne restait blanche. Même piège que sur
  // l'onglet Profil.
  const numero =
    profil?.telephone?.trim() ||
    (session.statut === 'connecte' ? session.session.user.phone?.trim() : '') ||
    null;

  const modifie =
    profil !== null &&
    (valeurPrenom.trim() !== profil.prenom ||
      valeurNom.trim() !== (profil.nom_complet ?? ''));

  const possible =
    modifie && valeurPrenom.trim().length >= 2 && envoi === 'repos' && !horsLigne;

  const enregistrer = async () => {
    setEnvoi('texte');
    setEchec(null);
    setFait(false);

    const { error } = await majProfil(valeurPrenom, valeurNom);
    setEnvoi('repos');

    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    setPrenom(null);
    setNom(null);
    setFait(true);
    relire();
  };

  const changerPhoto = async () => {
    setEnvoi('photo');
    setEchec(null);
    const resultat = await deposerPhotoProfil();
    setEnvoi('repos');

    if (!resultat.ok) {
      if (resultat.cle === 'annule') return;
      setEchec(
        resultat.cle === 'permission'
          ? t('dossier.erreurPermission')
          : t('dossier.erreurEnvoi'),
      );
      return;
    }
    relire();
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1 px-16"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[22px] font-extrabold text-ink">
            {t('monProfil.titre')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">
              {t('commun.retour')}
            </Text>
          </Pressable>
        </View>

        {horsLigne ? <Bandeau texte={t('monProfil.horsLigne')} /> : null}

        {statut === 'chargement' ? (
          <View className="mt-24 items-center">
            <ActivityIndicator />
            <Text className="mt-8 text-[13px] font-semibold text-muted">
              {t('commun.chargement')}
            </Text>
          </View>
        ) : statut === 'erreur' ? (
          <>
            <Bandeau texte={t('monProfil.illisible')} danger />
            <Pressable
              accessibilityRole="button"
              onPress={relire}
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
            {/* La photo : jamais un rond vide, l'initiale colorée tient la
                place tant qu'il n'y en a pas. */}
            <View
              className="mt-16 flex-row items-center rounded-card bg-card p-16"
              onLayout={(e) => noterMesure('photo', e.nativeEvent.layout.height)}
            >
              <Avatar prenom={profil?.prenom ?? null} photo={profil?.photo_url} />
              <Pressable
                accessibilityRole="button"
                disabled={envoi !== 'repos' || horsLigne}
                onPress={() => void changerPhoto()}
                className="ml-12 min-h-touch flex-1 justify-center"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text
                  className={`text-[14px] font-bold ${
                    envoi !== 'repos' || horsLigne ? 'text-muted' : 'text-accInk'
                  }`}
                >
                  {envoi === 'photo'
                    ? t('dossier.envoiEnCours')
                    : profil?.photo_url
                      ? t('monProfil.changerPhoto')
                      : t('monProfil.ajouterPhoto')}
                </Text>
              </Pressable>
            </View>

            <Champ
              nom="champ"
              etiquette={t('monProfil.prenom')}
              aide={t('monProfil.prenomAide')}
              valeur={valeurPrenom}
              onChange={(v) => {
                setPrenom(v.slice(0, 40));
                setFait(false);
              }}
              gele={envoi !== 'repos'}
              muted={couleurs.muted}
              majuscules="words"
            />

            <Champ
              etiquette={t('monProfil.nom')}
              aide={t('monProfil.nomFacultatif')}
              valeur={valeurNom}
              onChange={(v) => {
                setNom(v.slice(0, 120));
                setFait(false);
              }}
              gele={envoi !== 'repos'}
              muted={couleurs.muted}
              majuscules="words"
            />

            {/* Affiché, jamais modifiable. Voir l'en-tête du fichier. */}
            <View className="mt-16">
              <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
                {t('monProfil.numero')}
              </Text>
              <View className="mt-4 min-h-touch justify-center rounded-field bg-card2 px-12">
                <Text className="text-[15px] font-bold text-muted">
                  {numero ?? '—'}
                </Text>
              </View>
              <Text className="mt-4 text-[12px] font-semibold text-muted">
                {t('monProfil.numeroFige')}
              </Text>
            </View>

            {profil ? (
              <Text className="mt-16 text-[13px] font-semibold text-muted">
                {t('profil.membreDepuis', {
                  date: new Date(profil.cree_le).toLocaleDateString(
                    langue === 'en' ? 'en-GB' : 'fr-FR',
                    { month: 'long', year: 'numeric' },
                  ),
                })}
              </Text>
            ) : null}

            {echec ? <Bandeau texte={echec} danger /> : null}
            {fait ? <Bandeau texte={t('monProfil.enregistre')} /> : null}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !possible, busy: envoi === 'texte' }}
              disabled={!possible}
              onPress={() => void enregistrer()}
              onLayout={(e) => noterMesure('enregistrer', e.nativeEvent.layout.height)}
              className={`mt-24 min-h-driving flex-row items-center justify-center rounded-button ${
                possible ? 'bg-accFill' : 'bg-card2'
              }`}
              style={({ pressed }) => ({ opacity: pressed && possible ? 0.7 : 1 })}
            >
              {envoi === 'texte' ? <ActivityIndicator className="mr-8" /> : null}
              <Text
                className={`text-[16px] font-extrabold ${
                  possible ? 'text-onAcc' : 'text-muted'
                }`}
              >
                {t('monProfil.enregistrer')}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

function Champ({
  nom,
  etiquette,
  aide,
  valeur,
  onChange,
  gele,
  muted,
  majuscules,
}: {
  nom?: string;
  etiquette: string;
  aide: string;
  valeur: string;
  onChange: (v: string) => void;
  gele: boolean;
  muted: string;
  majuscules: 'words' | 'none';
}) {
  return (
    <View className="mt-16">
      <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
        {etiquette}
      </Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        editable={!gele}
        autoCapitalize={majuscules}
        autoCorrect={false}
        placeholderTextColor={muted}
        accessibilityLabel={etiquette}
        onLayout={
          nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined
        }
        className={`mt-4 min-h-[56px] rounded-field px-12 text-[17px] font-bold ${
          gele ? 'bg-bg text-muted' : 'bg-card text-ink'
        }`}
      />
      <Text className="mt-4 text-[12px] font-semibold text-muted">{aide}</Text>
    </View>
  );
}
