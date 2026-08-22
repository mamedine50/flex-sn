import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '../i18n';
import { communesPour, useCommunes, type Commune } from '../lib/communes';
import { useFavoris, type Favori } from '../lib/favoris';
import { useLocalisation } from '../lib/localisation';
import { chercherLieux, GLYPHE, useLieux } from '../lib/lieux';
import { lieuLePlusProche } from '../lib/lieuxOrdre';
import { lieuDepuisFavori } from '../lib/lieuNeutre';
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
  /** Ce que l'utilisateur a écrit, ou le nom de la ville choisie. PART AU SERVEUR. */
  libelle: string;
  /**
   * Le nom d'un favori — « Domicile », « Chez ma sœur ». Affiché À SON
   * PROPRIÉTAIRE et à personne d'autre : `destination_libelle` est servi au
   * conducteur, et on ne floute pas un point pour nommer la porte juste après.
   */
  prive?: string;
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
  // LE CLAVIER SE FERME AU CHOIX, ET ICI PLUTÔT QU'À CHAQUE APPEL. Il y a trois
  // chemins pour choisir — un favori, un résultat de recherche, un point sur la
  // carte — et le clavier restait ouvert sur les trois : il masquait la moitié
  // de l'écran suivant, et il fallait le chasser à la main pour voir ce qu'on
  // venait de choisir. Envelopper le rappel une fois vaut mieux que trois
  // `Keyboard.dismiss()` qu'on oubliera d'ajouter au quatrième chemin.
  const choisirEtFermerLeClavier = useCallback(
    (lieu: Lieu) => {
      Keyboard.dismiss();
      onChoisir(lieu);
    },
    [onChoisir],
  );

  if (!visible) return null;
  return mode === 'carte' ? (
    <SurCarte
      titre={titre}
      depart={depart}
      onChoisir={choisirEtFermerLeClavier}
      onFermer={onFermer}
    />
  ) : (
    <DansLaListe
      titre={titre}
      onChoisir={choisirEtFermerLeClavier}
      onFermer={onFermer}
    />
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

  // Le nom du quartier touché dans la recherche. Il survit au recentrage, et
  // c'est lui qui nomme le point si l'utilisateur ne précise rien.
  const [nomChoisi, setNomChoisi] = useState<string | null>(null);


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
  const { favoris } = useFavoris();
  // La position sert au raccourci « Ma position ». On la lit ici plutôt que de
  // la faire descendre en propriété : le sélecteur s'ouvre depuis trois écrans,
  // et trois chemins de propriété se désaccordent au premier oubli.
  const { position } = useLocalisation();

  const suggestions = useMemo(() => {
    if (normaliserVide(recherche)) return [];
    return chercherLieux(lieux, recherche);
  }, [lieux, recherche]);

  const surEtat = useCallback((etat: Exclude<EtatCarte, 'attente'>) => {
    setEtatCarte(etat);
  }, []);

  /**
   * COMMENT ON NOMME UN POINT POSÉ SUR LA CARTE, dans l'ordre :
   *
   *   1. ce que la personne a écrit — rien ne vaut ses propres mots ;
   *   2. le quartier qu'elle a touché dans la recherche ;
   *   3. le lieu connu le plus proche, annoncé comme APPROCHANT — « près de
   *      Ouakam », jamais « Ouakam » : le repère vient d'une table de
   *      centroïdes, présenter une approximation comme un fait est le défaut
   *      que la règle des communes interdit déjà ailleurs ;
   *   4. et seulement là, « Point sur la carte ».
   *
   * L'ancien code sautait directement au quatrième.
   */
  const nommer = () => {
    const ecrit = libelle.trim();
    if (ecrit) return ecrit;
    if (nomChoisi) return nomChoisi;
    const proche = lieuLePlusProche(lieux, {
      lat: centre.latitude,
      lon: centre.longitude,
    });
    if (proche) return t('prix.presDe', { lieu: proche.nom });
    return t('prix.pointSurLaCarte');
  };

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

          {/* LES FAVORIS D'ABORD. C'est toute la fonctionnalité : un appui et
              c'est choisi, sans passer par la recherche. Ils ne recentrent pas
              la carte — ils CHOISISSENT, parce qu'un lieu enregistré a déjà été
              pointé une fois. */}
          <RangeeFavoris favoris={favoris} position={position} onChoisir={onChoisir} />

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
                    //
                    // MAIS ON RETIENT LE NOM. Il était jeté : après avoir tapé
                    // « Ouakam » et l'avoir touché, la demande partait sous le
                    // nom « Point sur la carte » — ce qui ne dit rien au
                    // conducteur qui le lira, ni au passager qui relira sa
                    // propre demande.
                    //
                    // Et le clavier se range ICI, à l'instant du choix : il
                    // masquait la carte qu'on venait de recentrer, c'est-à-dire
                    // exactement ce qu'on voulait regarder.
                    Keyboard.dismiss();
                    setRecentrage({ latitude: lieu.lat, longitude: lieu.lon });
                    setRecherche('');
                    setNomChoisi(lieu.nom);
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
                libelle: nommer(),
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

/**
 * Les favoris, en pastilles, sur une ligne qui défile.
 *
 * Le nom affiché vient de l'interface pour « Domicile » et « Travail » : ces
 * deux-là ne sont pas stockés, ils se traduisent.
 */
/**
 * Les raccourcis, « Ma position » en tête.
 *
 * ELLE EST PREMIÈRE ET ELLE N'EST PAS UN FAVORI. Neuf fois sur dix, le point de
 * départ est là où l'on se tient : le chercher sur une carte ou le taper est un
 * détour absurde. Et c'est le SEUL chemin praticable hors de Dakar — la table
 * des lieux ne contient que des quartiers dakarois, donc chercher « Gatineau »
 * ne rend rien. Un testeur au Canada pose sa position d'un appui.
 *
 * Elle ne s'affiche que si la position est connue : proposer un raccourci qui
 * échoue vaut moins que ne rien proposer.
 */
function RangeeFavoris({
  favoris,
  position,
  onChoisir,
}: {
  favoris: Favori[];
  position: { latitude: number; longitude: number } | null;
  onChoisir: (lieu: Lieu) => void;
}) {
  const t = useT();
  if (favoris.length === 0 && !position) return null;

  const nomDe = (f: Favori) =>
    f.type === 'domicile'
      ? t('favoris.domicile')
      : f.type === 'travail'
        ? t('favoris.travail')
        : (f.libelle ?? '');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      className="mt-8"
      contentContainerClassName="gap-8"
    >
      {position ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('prix.maPosition')}
          onPress={() =>
            onChoisir({
              lat: position.latitude,
              lon: position.longitude,
              libelle: t('prix.maPosition'),
            })
          }
          className="min-h-touch justify-center rounded-full bg-accFill px-16"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[14px] font-bold text-onAcc">{t('prix.maPosition')}</Text>
        </Pressable>
      ) : null}

      {favoris.map((f) => (
        <Pressable
          key={f.id}
          accessibilityRole="button"
          accessibilityLabel={nomDe(f)}
          onPress={() =>
            onChoisir(lieuDepuisFavori(f, t('prix.pointSurLaCarte'), nomDe(f)))
          }
          className="min-h-touch flex-row items-center rounded-field bg-card2 px-12"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[13px] font-bold text-accInk">
            {GLYPHE_FAVORI[f.type]}
          </Text>
          <Text className="ml-8 text-[14px] font-bold text-ink" numberOfLines={1}>
            {nomDe(f)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Un signe par type. Même famille que les glyphes de `lieux.ts`. */
export const GLYPHE_FAVORI: Record<Favori['type'], string> = {
  domicile: '⌂',
  travail: '▣',
  autre: '★',
};

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
