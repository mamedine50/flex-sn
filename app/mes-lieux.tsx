import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChoixLieu, { type Lieu } from '../src/components/ChoixLieu';
import { Pastille } from '../src/components/Icones';
import { useT } from '../src/i18n';
import { cleErreur } from '../src/lib/erreursServeur';
import {
  enregistrerFavori,
  supprimerFavori,
  useFavoris,
  type Favori,
  type TypeFavori,
} from '../src/lib/favoris';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useGardeSession } from '../src/lib/garde';
import { useLocalisation } from '../src/lib/localisation';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * Mes lieux.
 *
 * Rien de neuf à construire pour le choix du point : c'est le sélecteur
 * existant — carte, repère fixe, recherche de quartier. Un lieu enregistré est
 * un point comme un autre.
 *
 * Le NOM et la PRÉCISION ne quittent jamais cet écran. Ils servent à se
 * retrouver, pas à décrire une adresse à un conducteur : `destination_libelle`
 * est servi à la file, et on ne floute pas un point pour nommer la porte.
 */

const GABARIT = { ligne: 50 };

type EnCours = { type: TypeFavori; id?: string } | null;

export default function MesLieux() {
  const t = useT();
  useGardeSession('/mes-lieux');

  const marges = useSafeAreaInsets();
  const { couleurs } = useTheme();
  const { position } = useLocalisation();
  const { favoris, statut, relire } = useFavoris();

  const [enCours, setEnCours] = useState<EnCours>(null);
  const [nom, setNom] = useState('');
  const [precision, setPrecision] = useState('');
  const [aSupprimer, setASupprimer] = useState<Favori | null>(null);
  const [echec, setEchec] = useState<string | null>(null);

  configurerGabarit('mes-lieux', GABARIT);

  const domicile = favoris.find((f) => f.type === 'domicile') ?? null;
  const travail = favoris.find((f) => f.type === 'travail') ?? null;
  const autres = favoris.filter((f) => f.type === 'autre');

  const nomDe = (f: Favori) =>
    f.type === 'domicile'
      ? t('favoris.domicile')
      : f.type === 'travail'
        ? t('favoris.travail')
        : (f.libelle ?? '');

  const ouvrir = (type: TypeFavori, existant?: Favori | null) => {
    setEchec(null);
    setNom(existant?.libelle ?? '');
    setPrecision(existant?.precision_texte ?? '');
    setEnCours({ type, id: existant?.id });
  };

  const poser = async (lieu: Lieu) => {
    if (!enCours) return;
    const { error } = await enregistrerFavori({
      type: enCours.type,
      lat: lieu.lat,
      lon: lieu.lon,
      // Pour « autre », le nom vient du champ de cet écran — et À DÉFAUT, du
      // NOM DU LIEU CHOISI. Sans ce repli, choisir « Ouakam » sans rien taper
      // enregistrait un favori sans nom : la ligne s'affichait vide, et le seul
      // repère restant était le point sur la carte. Le sélecteur ne rend jamais
      // de coordonnées — c'est un nom de quartier, ou « Point sur la carte ».
      libelle: enCours.type === 'autre' ? nom.trim() || lieu.libelle : null,
      precision: precision || null,
      id: enCours.id ?? null,
    });
    setEnCours(null);
    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    setNom('');
    setPrecision('');
    relire();
  };

  const retirer = async () => {
    if (!aSupprimer) return;
    const { error } = await supprimerFavori(aSupprimer.id);
    setASupprimer(null);
    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    relire();
  };

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between px-16">
          <Text className="text-[22px] font-extrabold text-ink">{t('favoris.titre')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            className="min-h-touch justify-center pl-16"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        <Text className="mt-8 px-16 text-[13px] font-semibold text-muted">
          {t('favoris.prive')}
        </Text>

        {echec ? (
          <View className="mx-16 mt-12 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-bold text-danger">{echec}</Text>
          </View>
        ) : null}

        {statut === 'pret' && favoris.length === 0 ? (
          <View className="mx-16 mt-16 rounded-card bg-card p-16">
            <Text className="text-[15px] font-bold text-ink">{t('favoris.aucun')}</Text>
            <Text className="mt-4 text-[13px] font-semibold text-muted">
              {t('favoris.aucunAide')}
            </Text>
          </View>
        ) : null}

        <View className="mt-16">
          <Rangee
            nom="ligne"
            icone="domicile"
            titre={t('favoris.domicile')}
            sous={domicile?.precision_texte ?? undefined}
            action={domicile ? t('favoris.modifier') : t('favoris.definir')}
            onPress={() => ouvrir('domicile', domicile)}
            onSupprimer={domicile ? () => setASupprimer(domicile) : undefined}
          />
          <Rangee
            icone="travail"
            titre={t('favoris.travail')}
            sous={travail?.precision_texte ?? undefined}
            action={travail ? t('favoris.modifier') : t('favoris.definir')}
            onPress={() => ouvrir('travail', travail)}
            onSupprimer={travail ? () => setASupprimer(travail) : undefined}
          />

          {autres.map((f) => (
            <Rangee
              key={f.id}
              icone="lieu"
              titre={nomDe(f)}
              sous={f.precision_texte ?? undefined}
              action={t('favoris.modifier')}
              onPress={() => ouvrir('autre', f)}
              onSupprimer={() => setASupprimer(f)}
            />
          ))}

          <Rangee
            icone="plus"
            titre={t('favoris.ajouter')}
            action={t('favoris.definir')}
            onPress={() => ouvrir('autre')}
          />
        </View>

        {/* Le nom et la précision se saisissent AVANT le point : on remplit un
            formulaire, puis on pose le repère, et le sélecteur confirme. */}
        {enCours ? (
          <View className="mx-16 mt-16 rounded-card bg-card p-16">
            {enCours.type === 'autre' ? (
              <>
                <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
                  {t('favoris.nommer')}
                </Text>
                <TextInput
                  value={nom}
                  onChangeText={(v) => setNom(v.slice(0, 40))}
                  autoFocus
                  placeholder={t('favoris.nommerIndice')}
                  placeholderTextColor={couleurs.muted}
                  accessibilityLabel={t('favoris.nommer')}
                  className="mt-4 min-h-touch rounded-field bg-card2 px-12 text-[15px] font-bold text-ink"
                />
              </>
            ) : null}

            <TextInput
              value={precision}
              onChangeText={(v) => setPrecision(v.slice(0, 120))}
              placeholder={t('prix.precisionFacultative')}
              placeholderTextColor={couleurs.muted}
              accessibilityLabel={t('prix.precisionFacultative')}
              className="mt-8 min-h-touch rounded-field bg-card2 px-12 text-[15px] font-semibold text-ink"
            />
          </View>
        ) : null}
      </ScrollView>

      {/* Le sélecteur existant. Il n'a rien à savoir des favoris. */}
      <ChoixLieu
        visible={enCours !== null && (enCours.type !== 'autre' || nom.trim().length > 0)}
        titre={t('favoris.enregistrer')}
        mode="carte"
        depart={position}
        onChoisir={(lieu) => void poser(lieu)}
        onFermer={() => setEnCours(null)}
      />

      <Modal visible={aSupprimer !== null} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setASupprimer(null)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('favoris.confirmerSuppression')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void retirer()}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-danger">
                {t('favoris.supprimer')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setASupprimer(null)}
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

function Rangee({
  nom,
  icone,
  titre,
  sous,
  action,
  onPress,
  onSupprimer,
}: {
  nom?: string;
  icone: 'domicile' | 'travail' | 'lieu' | 'plus';
  titre: string;
  sous?: string;
  action: string;
  onPress: () => void;
  onSupprimer?: () => void;
}) {
  const t = useT();
  return (
    <View
      className="mx-16 mb-8 min-h-[50px] flex-row items-center rounded-card bg-card px-12 py-8"
      onLayout={nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined}
    >
      <Pastille nom={icone} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${titre}. ${action}`}
        onPress={onPress}
        className="ml-12 min-h-touch flex-1 justify-center"
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <Text className="text-[15px] font-bold text-ink">{titre}</Text>
        <Text className="text-[12px] font-semibold text-muted" numberOfLines={1}>
          {sous ?? action}
        </Text>
      </Pressable>

      {onSupprimer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('favoris.supprimer')} ${titre}`}
          onPress={onSupprimer}
          className="min-h-touch justify-center px-12"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[15px] font-bold text-danger">×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
