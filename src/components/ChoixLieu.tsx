import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useT } from '../i18n';
import { communesPour, useCommunes, type Commune } from '../lib/communes';
import { chercherLieux, GLYPHE, useLieux } from '../lib/lieux';
import { noterMesure } from '../lib/gabarit';
import { useTheme } from '../theme/ThemeProvider';
import type { EtatCarte } from './CarteFond';

const CarteFond = lazy(() => import('./CarteFond'));

/**
 * Choisir un lieu.
 *
 * **La carte EST le sélecteur.** Le repère reste fixe au centre de l'écran et
 * c'est la carte qui glisse dessous ; sa position au relâchement est le point
 * choisi. Zéro appel facturé : on lit le centre d'une carte qu'on affiche déjà.
 *
 * Pourquoi pas une liste de communes pour une course urbaine : un conducteur qui
 * reçoit « Ouakam » comme point de prise en charge ne peut pas venir chercher
 * quelqu'un. En ville il faut le point à cinquante mètres près.
 *
 * Le champ de texte libre — « devant la pharmacie », « entrée du terrain » — est
 * celui qu'on ne sert JAMAIS avant acceptation. Il trouve ici son emploi, et la
 * règle tient : la maille et la commune avant, le point exact et le texte après.
 *
 * La liste de communes reste pour une destination INTERURBAINE : là, la
 * destination est une ville, et un centroïde est la bonne granularité.
 */
export type Lieu = {
  lat: number;
  lon: number;
  /** Ce que l'utilisateur a écrit, ou le nom de la ville choisie. */
  libelle: string;
};

/**
 * Rayon visible au premier affichage. Un cadrage plus serré oblige à dézoomer
 * pour se situer — on ne reconnaît pas un quartier à trois rues près.
 */
const RAYON_INITIAL_M = 1000;

/** 1° de latitude ≈ 111,32 km. Le delta couvre le DIAMÈTRE, d'où le facteur 2. */
const DELTA_INITIAL = (2 * RAYON_INITIAL_M) / 111320;

const REGION_DEFAUT = {
  latitude: 14.6928,
  longitude: -17.4467,
  latitudeDelta: DELTA_INITIAL,
  longitudeDelta: DELTA_INITIAL,
};

/** Une recherche vide ou blanche ne propose rien. */
function normaliserVide(texte: string): boolean {
  return texte.trim() === '';
}

type Props = {
  visible: boolean;
  titre: string;
  /** `carte` pour un point précis, `villes` pour une destination interurbaine. */
  mode: 'carte' | 'villes';
  /** Centre initial de la carte — la position GPS quand on l'a. */
  depart?: { latitude: number; longitude: number } | null;
  onChoisir: (lieu: Lieu) => void;
  onFermer: () => void;
};

export default function ChoixLieu({
  visible,
  titre,
  mode,
  depart,
  onChoisir,
  onFermer,
}: Props) {
  if (!visible) return null;
  return mode === 'carte' ? (
    <SurCarte titre={titre} depart={depart} onChoisir={onChoisir} onFermer={onFermer} />
  ) : (
    <DansLaListe titre={titre} onChoisir={onChoisir} onFermer={onFermer} />
  );
}

// ------------------------------------------------------------------ carte --

function SurCarte({
  titre,
  depart,
  onChoisir,
  onFermer,
}: Omit<Props, 'visible' | 'mode'>) {
  const t = useT();
  const { couleurs } = useTheme();

  const region = useMemo(
    () => (depart ? { ...REGION_DEFAUT, ...depart } : REGION_DEFAUT),
    [depart],
  );

  const [centre, setCentre] = useState({
    latitude: region.latitude,
    longitude: region.longitude,
  });
  const [libelle, setLibelle] = useState('');
  const [etatCarte, setEtatCarte] = useState<EtatCarte>('attente');

  // La recherche DÉPLACE la carte ; elle ne choisit pas le point. Le point reste
  // celui du repère au moment de Confirmer — sinon on rendrait un centroïde de
  // commune, exactement ce que cet écran existe pour éviter.
  const [recherche, setRecherche] = useState('');
  const [recentrage, setRecentrage] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const lieux = useLieux();

  const suggestions = useMemo(() => {
    if (normaliserVide(recherche)) return [];
    return chercherLieux(lieux, recherche);
  }, [lieux, recherche]);

  const surEtat = useCallback((etat: Exclude<EtatCarte, 'attente'>) => {
    setEtatCarte(etat);
  }, []);

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <View className="flex-1 bg-map">
        <Suspense fallback={null}>
          <CarteFond
            region={region}
            centrerSur={recentrage}
            onEtat={surEtat}
            onCentre={setCentre}
          />
        </Suspense>

        {/* Le repère ne bouge JAMAIS. Il est posé au centre géométrique de
            l'écran, hors de la carte : c'est la carte qui se déplace dessous. */}
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          <View className="h-24 w-24 rounded-pill border-2 border-shapeOutline bg-accFill" />
        </View>

        {etatCarte === 'indisponible' ? (
          <View className="absolute left-16 right-16 top-48 rounded-field bg-card px-16 py-12">
            <Text className="text-[13px] font-bold text-ink">
              {t('accueil.carteIndisponible')}
            </Text>
          </View>
        ) : null}

        <View className="absolute left-0 right-0 top-0 bg-card px-16 pb-12 pt-48">
          <View className="flex-row items-center justify-between">
            <Text className="text-[17px] font-extrabold text-ink">{titre}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('commun.fermer')}
              onPress={onFermer}
              className="min-h-touch justify-center px-12"
            >
              <Text className="text-[15px] font-bold text-accInk">
                {t('commun.fermer')}
              </Text>
            </Pressable>
          </View>

          {/* Recherche par quartier, filtrée EN LOCAL sur la table communes.
              Aucun appel réseau, aucun service de géocodage. */}
          <TextInput
            value={recherche}
            onChangeText={setRecherche}
            placeholder={t('prix.chercherQuartier')}
            placeholderTextColor={couleurs.muted}
            className="mt-8 min-h-touch rounded-field bg-card2 px-16 text-[15px] font-semibold text-ink"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {suggestions.length > 0 ? (
            <View className="mt-8 overflow-hidden rounded-field bg-card2">
              {suggestions.map((lieu) => (
                <Pressable
                  key={lieu.code}
                  accessibilityRole="button"
                  accessibilityLabel={lieu.nom}
                  onPress={() => {
                    // On recentre, on ne CHOISIT pas : l'utilisateur affine
                    // ensuite au repère, et c'est le repère qui fait foi.
                    setRecentrage({ latitude: lieu.lat, longitude: lieu.lon });
                    setRecherche('');
                  }}
                  className="min-h-touch flex-row items-center px-16 py-8"
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Text className="w-24 text-[13px] font-bold text-muted">
                    {GLYPHE[lieu.categorie]}
                  </Text>
                  <Text className="flex-1 text-[14px] font-bold text-ink" numberOfLines={1}>
                    {lieu.nom}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <View className="absolute bottom-0 left-0 right-0 rounded-t-sheet bg-card px-16 pb-32 pt-16">
          <Text className="text-[12px] font-semibold text-muted">
            {t('prix.reperePosition')}
          </Text>

          <TextInput
            value={libelle}
            onChangeText={setLibelle}
            placeholder={t('prix.precisionFacultative')}
            placeholderTextColor={couleurs.muted}
            className="mt-8 min-h-touch rounded-field bg-card2 px-16 text-[15px] font-semibold text-ink"
            maxLength={120}
          />

          <Pressable
            accessibilityRole="button"
            onLayout={(e) => noterMesure('confirmerLieu', e.nativeEvent.layout.height)}
            onPress={() =>
              onChoisir({
                lat: centre.latitude,
                lon: centre.longitude,
                // À défaut de précision, on garde une trace lisible : sans
                // libellé la contrainte de longueur en base refuserait la ligne.
                libelle: libelle.trim() || t('prix.pointSurLaCarte'),
              })
            }
            className="mt-12 min-h-driving items-center justify-center rounded-button bg-accFill"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[16px] font-extrabold text-onAcc">
              {t('prix.confirmerCePoint')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ------------------------------------------------------------------ villes --

function DansLaListe({ titre, onChoisir, onFermer }: Omit<Props, 'visible' | 'mode'>) {
  const t = useT();
  const { couleurs } = useTheme();
  const etat = useCommunes();
  const [filtre, setFiltre] = useState('');

  const liste = useMemo(() => {
    const candidates = communesPour(etat.communes, 'interurbain');
    const recherche = filtre.trim().toLocaleLowerCase('fr');
    if (!recherche) return candidates;
    return candidates.filter((c) => c.nom.toLocaleLowerCase('fr').includes(recherche));
  }, [etat.communes, filtre]);

  const choisir = (commune: Commune) =>
    onChoisir({ lat: commune.lat, lon: commune.lon, libelle: commune.nom });

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <View className="flex-1 bg-bg px-16 pt-48">
        <View className="flex-row items-center justify-between">
          <Text className="text-[20px] font-extrabold text-ink">{titre}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.fermer')}
            onPress={onFermer}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.fermer')}</Text>
          </Pressable>
        </View>

        <TextInput
          value={filtre}
          onChangeText={setFiltre}
          placeholder={t('prix.chercherVille')}
          placeholderTextColor={couleurs.muted}
          className="mt-16 min-h-touch rounded-field bg-card2 px-16 text-[15px] font-semibold text-ink"
          autoCorrect={false}
        />

        {etat.statut === 'chargement' ? (
          <View className="mt-12">
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} className="mb-8 h-[64px] rounded-field bg-card" />
            ))}
          </View>
        ) : (
          <FlatList
            data={liste}
            keyExtractor={(c) => c.code}
            className="mt-12"
            ListEmptyComponent={
              <Text className="mt-24 text-[14px] font-semibold text-muted">
                {etat.statut === 'erreur' ? t('erreurs.reseau') : t('prix.aucuneVille')}
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => choisir(item)}
                className="mb-8 min-h-touch justify-center rounded-field bg-card px-16 py-12"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text className="text-[15px] font-bold text-ink">{item.nom}</Text>
                <Text className="text-[12px] font-semibold text-muted">{item.region}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}
