import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PanneauDev, { type EtatForce } from '../../src/components/PanneauDev';
import { LANGUES_DISPONIBLES, useI18n, useT, type Langue } from '../../src/i18n';
import { useEstConducteur } from '../../src/lib/conducteur';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { PREFERENCES, useTheme, type PreferenceTheme } from '../../src/theme/ThemeProvider';

/**
 * Profil.
 *
 * L'entrée du mode conducteur vit ICI, et n'apparaît que pour qui a la
 * capacité. Elle était dans le panneau de développement faute de place produit ;
 * elle en sort.
 */

const GABARIT = { rangee: 48 };

export default function Profil() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { preference, definirPreference } = useTheme();
  const { langue, definirLangue } = useI18n();
  const session = useSession();
  const capacite = useEstConducteur();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [confirmeDeconnexion, setConfirmeDeconnexion] = useState(false);

  configurerGabarit('profil', { rangee: GABARIT.rangee });

  const connecte = session.statut === 'connecte';

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1 px-16"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          paddingBottom: marges.bottom + 24,
        }}
      >
        <Pressable
          accessibilityRole="header"
          onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
        >
          <Text className="text-[22px] font-extrabold text-ink">{t('profil.titre')}</Text>
        </Pressable>

        {/* Conduire, ou conduire déjà. La capacité décide, pas un rôle. */}
        {capacite === 'oui' ? (
          <Rangee
            nom="rangee"
            titre={t('profil.modeConducteur')}
            sous={t('profil.modeConducteurSous')}
            principale
            onPress={() => router.push('/conducteur')}
          />
        ) : (
          <Rangee
            nom="rangee"
            titre={t('profil.conduire')}
            sous={t('profil.conduireSous')}
            principale
            onPress={() => router.push('/devenir-conducteur')}
          />
        )}

        <Section titre={t('profil.apparence')} />
        <Choix
          valeurs={PREFERENCES.map((p) => ({ cle: p, libelle: t(`theme.${p}`) }))}
          actuelle={preference}
          onChoisir={(v) => definirPreference(v as PreferenceTheme)}
        />

        <Section titre={t('profil.langue')} />
        <Choix
          valeurs={LANGUES_DISPONIBLES.map((l) => ({ cle: l, libelle: t(`langues.${l}`) }))}
          actuelle={langue}
          onChoisir={(v) => definirLangue(v as Langue)}
        />

        <Section titre={t('profil.compte')} />
        {connecte ? (
          <>
            <View className="rounded-card bg-card p-16">
              {/* `phone` vaut '' — pas `null` — pour un compte créé par
                  courriel : `??` ne rattrape pas la chaîne vide, et la carte
                  restait blanche. */}
              <Text className="text-[14px] font-bold text-ink">
                {session.session.user.phone?.trim() ||
                  session.session.user.email ||
                  session.session.user.id}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmeDeconnexion(true)}
              className="mt-12 min-h-touch items-center justify-center rounded-field bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[14px] font-bold text-danger">
                {t('profil.seDeconnecter')}
              </Text>
            </Pressable>
          </>
        ) : (
          <View className="rounded-card bg-card p-16">
            <Text className="text-[14px] font-semibold text-muted">
              {t('profil.nonConnecte')}
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={confirmeDeconnexion} transparent animationType="fade">
        <Pressable
          className="flex-1 items-center justify-center bg-bg/70 px-24"
          onPress={() => setConfirmeDeconnexion(false)}
        >
          <Pressable className="w-full rounded-card bg-card p-16">
            <Text className="text-[17px] font-extrabold text-ink">
              {t('profil.confirmerDeconnexion')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirmeDeconnexion(false);
                void supabase.auth.signOut();
              }}
              className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text className="text-[15px] font-extrabold text-danger">
                {t('profil.seDeconnecter')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmeDeconnexion(false)}
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

      {__DEV__ ? (
        <PanneauDev
          visible={panneauOuvert}
          actuel={etatForce}
          onChoisir={(e) => {
            setEtatForce(e);
            setPanneauOuvert(false);
          }}
          onFermer={() => setPanneauOuvert(false)}
        />
      ) : null}
    </View>
  );
}

function Section({ titre }: { titre: string }) {
  return (
    <Text className="mb-8 mt-24 text-[12px] font-bold uppercase tracking-wider text-muted">
      {titre}
    </Text>
  );
}

function Rangee({
  nom,
  titre,
  sous,
  principale = false,
  onPress,
}: {
  nom: string;
  titre: string;
  sous: string;
  principale?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titre}. ${sous}`}
      onPress={onPress}
      onLayout={(e) => noterMesure(nom, e.nativeEvent.layout.height)}
      className={`mt-16 min-h-driving justify-center rounded-card px-16 py-12 ${
        principale ? 'bg-accFill' : 'bg-card'
      }`}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text
        className={`text-[16px] font-extrabold ${principale ? 'text-onAcc' : 'text-ink'}`}
      >
        {titre}
      </Text>
      <Text
        className={`text-[12px] font-semibold ${principale ? 'text-onAcc' : 'text-muted'}`}
      >
        {sous}
      </Text>
    </Pressable>
  );
}

/** Un choix parmi peu : des pastilles côte à côte, pas une liste déroulante. */
function Choix({
  valeurs,
  actuelle,
  onChoisir,
}: {
  valeurs: { cle: string; libelle: string }[];
  actuelle: string;
  onChoisir: (cle: string) => void;
}) {
  return (
    <View className="flex-row gap-8">
      {valeurs.map(({ cle, libelle }) => {
        const choisi = cle === actuelle;
        return (
          <Pressable
            key={cle}
            accessibilityRole="button"
            accessibilityState={{ selected: choisi }}
            onPress={() => onChoisir(cle)}
            className={`min-h-touch flex-1 items-center justify-center rounded-field px-8 py-8 ${
              choisi ? 'bg-accFill' : 'bg-card'
            }`}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {/* Deux lignes : « Comme le téléphone » ne tient pas sur un tiers
                de largeur en français, et tronqué il ne veut plus rien dire. */}
            <Text
              className={`text-center text-[13px] font-bold ${
                choisi ? 'text-onAcc' : 'text-ink'
              }`}
              numberOfLines={2}
            >
              {libelle}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
