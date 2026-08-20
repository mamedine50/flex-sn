import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChoixLieu, { type Lieu } from '../src/components/ChoixLieu';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import { useBornesPrix } from '../src/lib/bornesPrix';
import { cleErreur } from '../src/lib/erreursServeur';
import { arrondirAuPas, formatXof, PAS_XOF, separerMilliers } from '../src/lib/format';
import { exigerSession } from '../src/lib/garde';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { useLocalisation } from '../src/lib/localisation';
import { useSession } from '../src/lib/session';
import { supabase } from '../src/lib/supabase';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Fixez votre prix.
 *
 * Le montant est la seule chose qui compte ici : il est gros, en `moneyInk`, et
 * en chiffres tabulaires — sans ça il tressaute à chaque appui sur `+`.
 *
 * Il n'est JAMAIS pré-rempli d'un chiffre inventé. Soit la base rend un prix
 * suggéré à partir du tarif de référence et de la distance, soit le champ
 * s'ouvre vide et exige une saisie. Ouvrir sur la borne basse ferait proposer
 * 500 F pour onze kilomètres, ne recevoir aucune réponse, et la première
 * expérience de Flex serait le silence.
 */

const GABARIT = { champ: 64, pas: 56, envoi: 56 };

type EtatEnvoi =
  | { statut: 'repos' }
  | { statut: 'envoi' }
  | { statut: 'envoye' }
  | { statut: 'echec'; cle: ReturnType<typeof cleErreur> };

export default function FixerPrix() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const parametres = useLocalSearchParams<{
    service?: string;
    departLat?: string;
    departLon?: string;
    departLibelle?: string;
    destLat?: string;
    destLon?: string;
    destLibelle?: string;
    prix?: string;
  }>();
  const session = useSession();
  const { position } = useLocalisation();

  const service = parametres.service === 'interurbain' ? 'interurbain' : 'urbain';

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const bornesReelles = useBornesPrix(service);
  /**
   * Le trajet peut ARRIVER par l'URL : c'est ainsi qu'on le retrouve au retour
   * de la connexion. Sans ça, quelqu'un qui s'inscrit au moment d'envoyer sa
   * proposition reviendrait devant un formulaire vide — et c'est exactement le
   * moment où l'on abandonne.
   */
  const [depart, setDepart] = useState<Lieu | null>(() =>
    lieuDepuisParametres(
      parametres.departLat,
      parametres.departLon,
      parametres.departLibelle,
    ),
  );
  const [destination, setDestination] = useState<Lieu | null>(() =>
    lieuDepuisParametres(parametres.destLat, parametres.destLon, parametres.destLibelle),
  );
  const [choix, setChoix] = useState<'depart' | 'destination' | null>(null);

  /** `null` = rien saisi. On ne confond pas « vide » et « zéro ». */
  const [prix, setPrix] = useState<number | null>(() => {
    const p = Number.parseInt(parametres.prix ?? '', 10);
    return Number.isFinite(p) && p > 0 ? p : null;
  });
  /**
   * La suggestion porte la paire de points qu'elle décrit. Sans ça, changer de
   * destination laisserait le prix de l'ancienne le temps d'un aller-retour —
   * et c'est l'instant où l'utilisateur lit le chiffre.
   */
  const [suggestion, setSuggestion] = useState<{ cle: string; valeur: number | null } | null>(
    null,
  );
  const [envoi, setEnvoi] = useState<EtatEnvoi>({ statut: 'repos' });

  configurerGabarit('prix', {
    champDepart: GABARIT.champ,
    champDestination: GABARIT.champ,
    pasMoins: GABARIT.pas,
    pasPlus: GABARIT.pas,
    envoi: GABARIT.envoi,
  });

  // Mémorisé : sans ça l'objet est neuf à chaque rendu et les `useMemo` en aval
  // se recalculent en boucle.
  const bornes = useMemo(() => {
    if (etatForce === 'bornes_chargement') {
      return { statut: 'chargement', bornes: null, erreur: null } as const;
    }
    if (etatForce === 'bornes_erreur') {
      return { statut: 'erreur', bornes: null, erreur: 'force' } as const;
    }
    return bornesReelles;
  }, [etatForce, bornesReelles]);

  // Le prix suggéré vient de la BASE : tarif de référence et distance PostGIS.
  // S'il rend NULL — tarif non renseigné — le champ reste vide, et c'est voulu.
  const clePaire =
    depart && destination
      ? `${depart.lat},${depart.lon}>${destination.lat},${destination.lon}`
      : null;

  useEffect(() => {
    if (!clePaire || !depart || !destination) return undefined;
    const vivant = { annule: false };

    void (async () => {
      const { data } = await supabase.rpc('prix_suggere', {
        p_service: service,
        p_depart_lat: depart.lat,
        p_depart_lon: depart.lon,
        p_destination_lat: destination.lat,
        p_destination_lon: destination.lon,
      });
      if (vivant.annule) return;
      const valeur = typeof data === 'number' ? data : null;
      setSuggestion({ cle: clePaire, valeur });
      // On n'écrase jamais une saisie de l'utilisateur.
      setPrix((actuel) => (actuel === null && valeur !== null ? valeur : actuel));
    })();

    return () => {
      vivant.annule = true;
    };
  }, [clePaire, depart, destination, service]);

  const suggere = suggestion?.cle === clePaire ? suggestion.valeur : null;

  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;
  const enEnvoi = etatForce === 'envoi_en_cours' || envoi.statut === 'envoi';
  const echec =
    etatForce === 'envoi_refuse'
      ? ('erreurs.prixHorsBornes' as const)
      : envoi.statut === 'echec'
        ? envoi.cle
        : null;

  const horsBornes =
    bornes.statut === 'pret' &&
    prix !== null &&
    (prix < bornes.bornes.min || prix > bornes.bornes.max);

  const deplacer = useCallback(
    (sens: 1 | -1) => {
      setPrix((actuel) => {
        const base = actuel ?? 0;
        const suivant = arrondirAuPas(base) + sens * PAS_XOF;
        return suivant < PAS_XOF ? PAS_XOF : suivant;
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [],
  );

  const saisir = useCallback((texte: string) => {
    const chiffres = texte.replace(/[^0-9]/g, '');
    setPrix(chiffres === '' ? null : Number.parseInt(chiffres, 10));
  }, []);

  const envoyer = useCallback(async () => {
    if (!depart || !destination || prix === null) return;

    // On regarde d'abord, on s'inscrit quand on agit. Le trajet part dans
    // l'URL de retour : la connexion ramène ici, rempli.
    if (!exigerSession(session.statut, cheminRetour(service, depart, destination, prix))) {
      return;
    }

    setEnvoi({ statut: 'envoi' });
    const { error } = await supabase.rpc('create_ride_request', {
      p_service: service,
      p_depart_lat: depart.lat,
      p_depart_lon: depart.lon,
      p_depart_libelle: depart.libelle,
      p_destination_lat: destination.lat,
      p_destination_lon: destination.lon,
      p_destination_libelle: destination.libelle,
      p_prix_xof: prix,
      // Ce que l'écran affichait au moment de la saisie. Le serveur en déduit si
      // le passager a touché au pré-rempli — c'est la seule ligne du journal
      // qu'il est seul à connaître.
      // `undefined` et non `null` : le type généré porte un paramètre optionnel,
      // et PostgREST omet alors la clé — la valeur par défaut de la fonction
      // s'applique, ce qui est exactement ce qu'on veut quand il n'y a pas eu de
      // recommandation.
      p_recommandation_xof: suggere ?? undefined,
    });

    if (error) {
      setEnvoi({ statut: 'echec', cle: cleErreur(error) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEnvoi({ statut: 'envoye' });
    // `replace` et non `push` : la proposition est partie, revenir au
    // formulaire ne mènerait qu'à `demande_deja_ouverte`. L'écran des offres
    // porte lui-même la confirmation — l'afficher ici aussi, c'est la dire deux
    // fois et laisser l'utilisateur sur un écran qui n'a plus rien à faire.
    router.replace('/offres');
  }, [depart, destination, prix, service, session.statut, suggere]);

  const envoiPossible =
    Boolean(depart) &&
    Boolean(destination) &&
    prix !== null &&
    prix % PAS_XOF === 0 &&
    bornes.statut === 'pret' &&
    !horsBornes &&
    !horsLigne &&
    !enEnvoi &&
    envoi.statut !== 'envoye';

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: marges.top + 8 }}>
      <ScrollView
        className="flex-1 px-16"
        contentContainerClassName="pb-24"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[22px] font-extrabold text-ink">{t('prix.titre')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('commun.retour')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        {horsLigne ? <Bandeau texte={t('prix.horsLigne')} /> : null}

        <Champ
          nom="champDepart"
          libelle={t('prix.depart')}
          // Le nom privé d'un favori s'affiche ICI, chez son propriétaire.
          // C'est `libelle` — neutre — qui part au serveur, voir `envoyer()`.
          valeur={depart?.prive ?? depart?.libelle ?? null}
          vide={t('prix.choisirDepart')}
          onPress={() => setChoix('depart')}
        />
        <Champ
          nom="champDestination"
          libelle={t('prix.destination')}
          valeur={destination?.prive ?? destination?.libelle ?? null}
          vide={t('prix.choisirDestination')}
          onPress={() => setChoix('destination')}
        />

        <View className="mt-16 rounded-card bg-card p-16">
          <Text className="text-[12px] font-semibold text-muted">
            {suggere !== null && prix === suggere
              ? t('prix.recommandeAPartirDe', { prix: formatXof(suggere) })
              : t('prix.montant')}
          </Text>

          {bornes.statut === 'chargement' ? (
            <SqueletteMontant texte={t('prix.bornesEnCours')} />
          ) : bornes.statut === 'erreur' ? (
            <View className="mt-8">
              <Text className="text-[15px] font-bold text-ink">
                {t('prix.bornesIndisponibles')}
              </Text>
              <Text className="mt-4 text-[13px] font-semibold text-muted">
                {t('prix.bornesIndisponiblesAide')}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={bornesReelles.reessayer}
                className="mt-12 min-h-touch justify-center rounded-field bg-card2 px-16"
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Text className="text-[14px] font-bold text-accInk">
                  {t('commun.reessayer')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="mt-4 flex-row items-baseline">
                <TextInput
                  value={prix === null ? '' : separerMilliers(prix)}
                  onChangeText={saisir}
                  onBlur={() => setPrix((a) => (a === null ? null : arrondirAuPas(a)))}
                  keyboardType="number-pad"
                  placeholder={t('prix.saisirPrix')}
                  placeholderTextColor={undefined}
                  accessibilityLabel={t('prix.montant')}
                  className="min-w-[120px] text-[44px] font-extrabold text-moneyInk"
                  style={chiffresTabulaires}
                  maxLength={9}
                />
                {prix !== null ? (
                  <Text className="ml-8 text-[22px] font-extrabold text-moneyInk">
                    FCFA
                  </Text>
                ) : null}
              </View>

              <View className="mt-12 flex-row items-center gap-12">
                <Pas
                  nom="pasMoins"
                  signe="−"
                  libelle={t('prix.baisser')}
                  onPress={() => deplacer(-1)}
                />
                <Text
                  className="text-[13px] font-bold text-muted"
                  style={chiffresTabulaires}
                >
                  {formatXof(PAS_XOF)}
                </Text>
                <Pas
                  nom="pasPlus"
                  signe="+"
                  libelle={t('prix.monter')}
                  onPress={() => deplacer(1)}
                />
              </View>

              <Text className="mt-12 text-[13px] font-semibold text-muted">
                {t('prix.fourchette', {
                  min: formatXof(bornes.bornes.min),
                  max: formatXof(bornes.bornes.max),
                })}
              </Text>

              {/* L'interurbain n'a pas de recommandation : son prix est un usage,
                  pas un calcul, et le servir au kilomètre serait faux. */}
              {service === 'interurbain' ? (
                <Text className="mt-8 text-[13px] font-semibold text-muted">
                  {t('prix.interurbainSansRecommandation')} {t('prix.peagesNonCompris')}
                </Text>
              ) : null}

              {horsBornes && prix !== null ? (
                <Text className="mt-8 text-[13px] font-bold text-danger">
                  {prix < bornes.bornes.min
                    ? t('prix.tropBas', { min: formatXof(bornes.bornes.min) })
                    : t('prix.tropHaut', { max: formatXof(bornes.bornes.max) })}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {echec ? (
          <Text className="mt-16 text-[14px] font-bold text-danger">{t(echec)}</Text>
        ) : null}

        <Manque
          texte={
            !depart
              ? t('prix.departManquant')
              : !destination
                ? t('prix.destinationManquante')
                : prix === null && bornes.statut === 'pret'
                  ? t('prix.prixManquant')
                  : null
          }
        />
      </ScrollView>

      <View className="px-16" style={{ paddingBottom: marges.bottom + 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !envoiPossible, busy: enEnvoi }}
          disabled={!envoiPossible}
          onPress={() => void envoyer()}
          onLayout={(e) => noterMesure('envoi', e.nativeEvent.layout.height)}
          className={`min-h-driving items-center justify-center rounded-button ${
            envoiPossible ? 'bg-accFill' : 'bg-card2'
          }`}
          style={({ pressed }) => ({ opacity: pressed && envoiPossible ? 0.7 : 1 })}
        >
          {/* Une action indisponible change de couleur, pas seulement d'opacité :
              un aplat clair à 50 % reste lumineux sur fond sombre. */}
          <Text
            className={`text-[16px] font-extrabold ${
              envoiPossible ? 'text-onAcc' : 'text-muted'
            }`}
          >
            {enEnvoi ? t('prix.envoiEnCours') : t('prix.envoyer')}
          </Text>
        </Pressable>
      </View>

      <ChoixLieu
        visible={choix !== null}
        titre={choix === 'depart' ? t('prix.choisirDepart') : t('prix.choisirDestination')}
        // En ville il faut le point à cinquante mètres près : « Ouakam » ne
        // permet pas de venir chercher quelqu'un. En interurbain la destination
        // EST une ville, et le centroïde est la bonne granularité.
        mode={choix === 'destination' && service === 'interurbain' ? 'villes' : 'carte'}
        depart={position}
        onChoisir={(lieu) => {
          if (choix === 'depart') setDepart(lieu);
          else setDestination(lieu);
          setChoix(null);
        }}
        onFermer={() => setChoix(null)}
      />

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

/** Un lieu reconstruit depuis l'URL. `null` dès qu'une pièce manque. */
function lieuDepuisParametres(
  lat?: string,
  lon?: string,
  libelle?: string,
): Lieu | null {
  const la = Number.parseFloat(lat ?? '');
  const lo = Number.parseFloat(lon ?? '');
  if (!Number.isFinite(la) || !Number.isFinite(lo) || !libelle) return null;
  return { lat: la, lon: lo, libelle };
}

/** L'écran, tel qu'il faudra le rouvrir après la connexion. */
function cheminRetour(
  service: string,
  depart: Lieu,
  destination: Lieu,
  prix: number,
): string {
  const p = new URLSearchParams({
    service,
    departLat: String(depart.lat),
    departLon: String(depart.lon),
    departLibelle: depart.libelle,
    destLat: String(destination.lat),
    destLon: String(destination.lon),
    destLibelle: destination.libelle,
    prix: String(prix),
  });
  return `/prix?${p.toString()}`;
}

function Bandeau({ texte }: { texte: string }) {
  return (
    <View className="mt-12 rounded-field bg-card px-16 py-12">
      <Text className="text-[13px] font-semibold text-ink">{texte}</Text>
    </View>
  );
}

function Manque({ texte }: { texte: string | null }) {
  if (!texte) return null;
  return <Text className="mt-12 text-[13px] font-semibold text-muted">{texte}</Text>;
}

function Champ({
  nom,
  libelle,
  valeur,
  vide,
  onPress,
}: {
  nom: string;
  libelle: string;
  valeur: string | null;
  vide: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${libelle}. ${valeur ?? vide}`}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className="mt-12 min-h-[64px] justify-center rounded-field bg-card px-16 py-12"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text className="text-[11px] font-semibold text-muted">{libelle}</Text>
      <Text
        className={`text-[15px] font-bold ${valeur ? 'text-ink' : 'text-muted'}`}
        numberOfLines={1}
      >
        {valeur ?? vide}
      </Text>
    </Pressable>
  );
}

function Pas({
  nom,
  signe,
  libelle,
  onPress,
}: {
  nom: string;
  signe: string;
  libelle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className="min-h-driving w-[72px] items-center justify-center rounded-field bg-card2"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text className="text-[24px] font-extrabold text-ink">{signe}</Text>
    </Pressable>
  );
}

/** Squelette, jamais de roue qui tourne. */
function SqueletteMontant({ texte }: { texte: string }) {
  return (
    <View className="mt-8">
      <View className="h-[48px] w-[180px] rounded-field bg-card2" />
      <View className="mt-12 flex-row gap-12">
        <View className="h-[56px] w-[72px] rounded-field bg-card2" />
        <View className="h-[56px] w-[72px] rounded-field bg-card2" />
      </View>
      <Text className="mt-12 text-[13px] font-semibold text-muted">{texte}</Text>
    </View>
  );
}
