import * as Haptics from 'expo-haptics';
import { useNetworkState } from 'expo-network';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ChoixCommune from '../src/components/ChoixCommune';
import PanneauDev, { type EtatForce } from '../src/components/PanneauDev';
import { useT } from '../src/i18n';
import { useBornesPrix } from '../src/lib/bornesPrix';
import type { Commune } from '../src/lib/communes';
import { cleErreur } from '../src/lib/erreursServeur';
import { formatXof, PAS_XOF } from '../src/lib/format';
import { configurerGabarit, noterMesure } from '../src/lib/gabarit';
import { supabase } from '../src/lib/supabase';
import { chiffresTabulaires } from '../src/theme/typographie';

/**
 * Fixez votre prix.
 *
 * Le montant est la seule chose qui compte sur cet écran : il est gros, il est
 * en `moneyInk`, et il est en chiffres tabulaires — sans ça il tressaute à
 * chaque appui sur `+` et l'application paraît cassée.
 *
 * Aucun prix n'est proposé tant que les bornes ne sont pas connues. Une
 * fourchette inventée ferait envoyer un montant que le serveur refuse ensuite,
 * et l'utilisateur ne comprendrait pas pourquoi.
 */

/** Gabarit, en points. Toute géométrie passe par des classes — voir CLAUDE.md. */
const GABARIT = {
  champ: 64,
  /** Les pas de prix se tapent en série : on prend la taille « au volant ». */
  pas: 56,
  envoi: 56,
};

type EtatEnvoi =
  | { statut: 'repos' }
  | { statut: 'envoi' }
  | { statut: 'envoye' }
  | { statut: 'echec'; cle: ReturnType<typeof cleErreur> };

export default function FixerPrix() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const reseau = useNetworkState();
  const parametres = useLocalSearchParams<{ service?: string }>();

  const service = parametres.service === 'interurbain' ? 'interurbain' : 'urbain';

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const bornesReelles = useBornesPrix(service);
  const [depart, setDepart] = useState<Commune | null>(null);
  const [destination, setDestination] = useState<Commune | null>(null);
  const [choix, setChoix] = useState<'depart' | 'destination' | null>(null);
  const [prix, setPrix] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState<EtatEnvoi>({ statut: 'repos' });

  configurerGabarit('prix', {
    champDepart: GABARIT.champ,
    champDestination: GABARIT.champ,
    pasMoins: GABARIT.pas,
    pasPlus: GABARIT.pas,
    envoi: GABARIT.envoi,
  });

  // Les états forcés du panneau de développement recouvrent le comportement réel.
  // Mémorisé : sans ça l'objet est neuf à chaque rendu et le `useMemo` du prix
  // se recalcule en boucle.
  const bornes = useMemo(() => {
    if (etatForce === 'bornes_chargement') {
      return { statut: 'chargement', bornes: null, erreur: null } as const;
    }
    if (etatForce === 'bornes_erreur') {
      return { statut: 'erreur', bornes: null, erreur: 'force' } as const;
    }
    return bornesReelles;
  }, [etatForce, bornesReelles]);

  const horsLigne = etatForce === 'hors_ligne' || reseau.isInternetReachable === false;
  const enEnvoi = etatForce === 'envoi_en_cours' || envoi.statut === 'envoi';
  const echec =
    etatForce === 'envoi_refuse'
      ? ('erreurs.prixHorsBornes' as const)
      : envoi.statut === 'echec'
        ? envoi.cle
        : null;

  // Le prix ne naît qu'avec les bornes. Le plancher plutôt que le milieu : un
  // milieu serait une suggestion, et c'est le passager qui fixe son prix.
  const prixAffiche = useMemo(() => {
    if (bornes.statut !== 'pret') return null;
    return prix ?? bornes.bornes.min;
  }, [bornes, prix]);

  const horsBornes =
    bornes.statut === 'pret' &&
    prixAffiche !== null &&
    (prixAffiche < bornes.bornes.min || prixAffiche > bornes.bornes.max);

  const deplacer = useCallback(
    (sens: 1 | -1) => {
      if (bornes.statut !== 'pret' || prixAffiche === null) return;
      const suivant = prixAffiche + sens * PAS_XOF;
      if (suivant < PAS_XOF) return;
      setPrix(suivant);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [bornes.statut, prixAffiche],
  );

  const envoyer = useCallback(async () => {
    if (!depart || !destination || prixAffiche === null) return;

    setEnvoi({ statut: 'envoi' });
    const { error } = await supabase.rpc('create_ride_request', {
      p_service: service,
      p_depart_lat: depart.lat,
      p_depart_lon: depart.lon,
      p_depart_libelle: depart.nom,
      p_destination_lat: destination.lat,
      p_destination_lon: destination.lon,
      p_destination_libelle: destination.nom,
      p_prix_xof: prixAffiche,
    });

    if (error) {
      setEnvoi({ statut: 'echec', cle: cleErreur(error) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // L'écran « Offres reçues » n'existe pas encore. En attendant on confirme
    // sur place plutôt que de revenir en arrière sans rien dire : la demande est
    // partie, l'utilisateur doit le savoir.
    setEnvoi({ statut: 'envoye' });
  }, [depart, destination, prixAffiche, service]);

  const envoiPossible =
    Boolean(depart) &&
    Boolean(destination) &&
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
            onPress={() => router.back()}
            onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('commun.retour')}</Text>
          </Pressable>
        </View>

        {horsLigne ? <Bandeau texte={t('prix.horsLigne')} /> : null}

        {envoi.statut === 'envoye' ? <Bandeau texte={t('offres.attente')} /> : null}

        <Champ
          nom="champDepart"
          libelle={t('prix.depart')}
          valeur={depart?.nom ?? null}
          vide={t('prix.choisirDepart')}
          onPress={() => setChoix('depart')}
        />
        <Champ
          nom="champDestination"
          libelle={t('prix.destination')}
          valeur={destination?.nom ?? null}
          vide={t('prix.choisirDestination')}
          onPress={() => setChoix('destination')}
        />

        <View className="mt-16 rounded-card bg-card p-16">
          <Text className="text-[12px] font-semibold text-muted">{t('prix.montant')}</Text>

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
              <Text
                className="mt-4 text-[44px] font-extrabold text-moneyInk"
                style={chiffresTabulaires}
                accessibilityLabel={formatXof(prixAffiche ?? 0)}
              >
                {formatXof(prixAffiche ?? 0)}
              </Text>

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

              {horsBornes ? (
                <Text className="mt-8 text-[13px] font-bold text-danger">
                  {prixAffiche !== null && prixAffiche < bornes.bornes.min
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

        {!depart && bornes.statut === 'pret' ? (
          <Text className="mt-12 text-[13px] font-semibold text-muted">
            {t('prix.departManquant')}
          </Text>
        ) : null}
        {depart && !destination ? (
          <Text className="mt-12 text-[13px] font-semibold text-muted">
            {t('prix.destinationManquante')}
          </Text>
        ) : null}
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
              un aplat clair à 50 % reste lumineux sur fond sombre, et le bouton
              a l'air actif alors qu'il ne l'est pas. */}
          <Text
            className={`text-[16px] font-extrabold ${
              envoiPossible ? 'text-onAcc' : 'text-muted'
            }`}
          >
            {enEnvoi ? t('prix.envoiEnCours') : t('prix.envoyer')}
          </Text>
        </Pressable>
      </View>

      <ChoixCommune
        visible={choix !== null}
        service={service}
        titre={choix === 'depart' ? t('prix.choisirDepart') : t('prix.choisirDestination')}
        onChoisir={(commune) => {
          if (choix === 'depart') setDepart(commune);
          else setDestination(commune);
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

function Bandeau({ texte }: { texte: string }) {
  return (
    <View className="mt-12 rounded-field bg-card px-16 py-12">
      <Text className="text-[13px] font-semibold text-ink">{texte}</Text>
    </View>
  );
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
