import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Avatar from '../../src/components/Avatar';
import { Pastille, type NomIcone } from '../../src/components/Icones';
import PanneauDev, { type EtatForce } from '../../src/components/PanneauDev';
import { useI18n, useT } from '../../src/i18n';
import { useEstAdmin, useFileDossiers } from '../../src/lib/admin';
import { useEstConducteur } from '../../src/lib/conducteur';
import { useFavoris } from '../../src/lib/favoris';
import { formatXof } from '../../src/lib/format';
import { configurerGabarit, noterMesure } from '../../src/lib/gabarit';
import { GAINS_VIDES, useGains } from '../../src/lib/gains';
import { useMonProfil } from '../../src/lib/monProfil';
import { deposerPhotoProfil } from '../../src/lib/photos';
import { useProfilPublic } from '../../src/lib/profilPublic';
import { useSession } from '../../src/lib/session';
import { supabase } from '../../src/lib/supabase';
import { useVehicule } from '../../src/lib/vehicule';
import { chiffresTabulaires } from '../../src/theme/typographie';

/**
 * Profil.
 *
 * PAS de tiroir latéral : la barre d'onglets est la seule navigation. Ce qu'un
 * tiroir contiendrait vit ici, groupé, et sur l'accueil pour le raccourci
 * conducteur.
 *
 * L'ordre des sections n'est pas décoratif. « Mes lieux » d'abord parce que
 * c'est ce qu'on vient régler le plus souvent ; « Conducteur » ensuite parce
 * que c'est ce qui rapporte ; l'affichage et le compte à la fin, parce qu'on y
 * va une fois.
 *
 * Chaque ligne porte une icône en pastille : l'œil suit une colonne de formes
 * avant de suivre une colonne de mots.
 */

const GABARIT = { entete: 92, ligne: 50 };

export default function Profil() {
  const t = useT();
  const marges = useSafeAreaInsets();
  const { langue } = useI18n();
  const session = useSession();

  const capacite = useEstConducteur();
  const conducteur = capacite === 'oui';

  // L'administration n'existe que pour qui la porte. Le filtre réel est en base
  // — `dossiers_en_attente` porte son `est_admin()` — mais on ne montre pas non
  // plus une porte fermée.
  const admin = useEstAdmin() === 'oui';
  const fileAdmin = useFileDossiers();

  const { profil, relire: relireProfil } = useMonProfil();
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const public_ = useProfilPublic(
    session.statut === 'connecte' ? session.session.user.id : null,
  );
  const gains = useGains(conducteur);
  const auto = useVehicule();
  const { favoris, relire: relireFavoris } = useFavoris();

  const [etatForce, setEtatForce] = useState<EtatForce>('aucun');
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [confirmeDeconnexion, setConfirmeDeconnexion] = useState(false);

  // Un lieu ajouté depuis « Mes lieux » doit apparaître ici au retour. Même
  // raison que pour le profil : cet onglet reste monté pendant qu'on modifie
  // ailleurs.
  const premierRetour = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (premierRetour.current) {
        premierRetour.current = false;
        return;
      }
      relireFavoris();
    }, [relireFavoris]),
  );

  configurerGabarit(conducteur ? 'profil+conducteur' : 'profil', GABARIT);

  const connecte = session.statut === 'connecte';
  const numero =
    profil?.telephone?.trim() ||
    (connecte ? session.session.user.phone?.trim() : '') ||
    '';

  const domicile = favoris.find((f) => f.type === 'domicile') ?? null;
  const travail = favoris.find((f) => f.type === 'travail') ?? null;

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: marges.top + 8,
          // La barre d'onglets flotte au-dessus : sans cette réserve, la
          // dernière ligne se retrouve dessous et ne se tape plus.
          paddingBottom: marges.bottom + 96,
        }}
      >
        {/* ─────────────────────────────────────────────────── entête ─── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${profil?.prenom ?? ''}. ${t('profil.modifier')}`}
          onPress={() => router.push('/mon-profil')}
          onLongPress={__DEV__ ? () => setPanneauOuvert(true) : undefined}
          onLayout={(e) => noterMesure('entete', e.nativeEvent.layout.height)}
          className="items-center px-16"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <View>
            <Avatar prenom={profil?.prenom ?? null} photo={profil?.photo_url} taille="grand" />
            {/* La pastille ouvre le téléversement existant — dépôt privé et
                réduction à 1200 px déjà branchés. Elle ne mène PAS à l'écran
                d'édition : changer sa photo est un geste, pas un formulaire. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('monProfil.changerPhoto')}
              disabled={photoEnCours}
              onPress={async () => {
                setPhotoEnCours(true);
                const r = await deposerPhotoProfil();
                setPhotoEnCours(false);
                if (r.ok) relireProfil();
              }}
              className="absolute bottom-0 right-0 h-32 w-32 items-center justify-center rounded-pill border-2 border-bg bg-accFill"
              style={({ pressed }) => ({ opacity: pressed || photoEnCours ? 0.7 : 1 })}
            >
              <Text className="text-[13px] font-extrabold text-onAcc">◎</Text>
            </Pressable>
          </View>

          <Text className="mt-12 text-center text-[22px] font-extrabold text-ink">
            {[profil?.prenom, profil?.nom_complet].filter(Boolean).join(' ') || '—'}
          </Text>

          <Text className="mt-4 text-center text-[13px] font-semibold text-muted">
            {conducteur && auto.vehicule
              ? `${auto.vehicule.modele} ${auto.vehicule.couleur} · ${auto.vehicule.plaque}`
              : [
                  numero ? t('profil.numeroMasque', { fin: numero.slice(-4) }) : null,
                  profil
                    ? t('profil.membreDepuis', {
                        date: new Date(profil.cree_le).toLocaleDateString(
                          langue === 'en' ? 'en-GB' : 'fr-FR',
                          { month: 'long', year: 'numeric' },
                        ),
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>

          <View className="mt-12 flex-row flex-wrap justify-center gap-8">
            {/* Sous cinq courses au volant, le badge remplace la note : une
                moyenne sur deux avis n'est pas une note. */}
            <Badge
              texte={
                public_?.est_nouveau || public_?.note_moyenne === null
                  ? t('profil.nouveauConducteur')
                  : t('offres.note', {
                      note: String(public_?.note_moyenne).replace('.', ','),
                    })
              }
            />
            <Badge
              texte={
                (public_?.courses_comme_conducteur ?? 0) === 1
                  ? t('profil.courses', { n: public_?.courses_comme_conducteur ?? 0 })
                  : t('profil.coursesPluriel', {
                      n: public_?.courses_comme_conducteur ?? 0,
                    })
              }
            />
            {conducteur ? <Badge texte={t('profil.valide')} succes /> : null}
          </View>
        </Pressable>

        {/* ──────────────────────────────────────────────── mes lieux ─── */}
        <Section titre={t('profil.mesLieux')} />
        <Ligne
          nom="ligne"
          icone="domicile"
          titre={t('favoris.domicile')}
          sous={domicile ? t('favoris.modifier') : t('favoris.definir')}
          onPress={() => router.push('/mes-lieux')}
        />
        <Ligne
          icone="travail"
          titre={t('favoris.travail')}
          sous={travail ? t('favoris.modifier') : t('favoris.definir')}
          onPress={() => router.push('/mes-lieux')}
        />
        <Ligne
          icone="plus"
          titre={t('favoris.ajouter')}
          onPress={() => router.push('/mes-lieux')}
        />

        {/* ─────────────────────────────────────────────── conducteur ─── */}
        <Section titre={t('profil.conducteur')} />
        {conducteur ? (
          <>
            <Gains gains={gains ?? GAINS_VIDES} />
            <Ligne
              icone="volant"
              titre={t('profil.passerEnLigne')}
              sous={t('profil.passerEnLigneSous')}
              onPress={() => router.push('/conducteur')}
            />
            <Ligne
              icone="documents"
              titre={t('profil.vehiculeEtDocuments')}
              sous={t('profil.vehiculeEtDocumentsSous')}
              onPress={() => router.push('/devenir-conducteur')}
            />
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('profil.conduire')}. ${t('profil.gainsCommission')}`}
            onPress={() => router.push('/devenir-conducteur')}
            className="mx-16 min-h-driving justify-center rounded-card bg-accFill px-16 py-12"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[16px] font-extrabold text-onAcc">
              {t('profil.conduire')}
            </Text>
            <Text className="mt-2 text-[12px] font-semibold text-onAcc">
              {t('profil.gainsCommission')}
            </Text>
            {/* La suite, dite tout de suite. Ce qui tue la confiance d'un
                conducteur, ce n'est pas le taux : c'est de le découvrir. */}
            <Text className="mt-4 text-[11px] font-semibold text-onAcc">
              {t('profil.commissionApres')}
            </Text>
          </Pressable>
        )}

        {/* ─────────────────────────────────────────── administration ─── */}
        {admin ? (
          <>
            <Section titre={t('admin.section')} />
            <Ligne
              icone="documents"
              titre={t('admin.file')}
              sous={
                fileAdmin.dossiers.length === 1
                  ? t('admin.fileSous', { n: fileAdmin.dossiers.length })
                  : t('admin.fileSousPluriel', { n: fileAdmin.dossiers.length })
              }
              onPress={() => router.push('/admin')}
            />
          </>
        ) : null}

        {/* ─────────────────────────────────────────────────── compte ─── */}
        <Section titre={t('profil.compte')} />
        <Ligne
          icone="documents"
          titre={t('profil.mesCourses')}
          sous={t('profil.mesCoursesSous')}
          onPress={() => router.push('/historique')}
        />
        <Ligne
          icone="gains"
          titre={t('profil.mesAvis')}
          sous={t('profil.mesAvisSous')}
          onPress={() => router.push('/avis')}
        />
        {/* Thème et langue quittent le fil : six pastilles au milieu du chemin
            pour des réglages qu'on touche une fois. */}
        <Ligne
          icone="theme"
          titre={t('profil.affichage')}
          sous={t('profil.affichageSous')}
          onPress={() => router.push('/reglages')}
        />
        <Ligne
          icone="bloque"
          titre={t('profil.personnesBloquees')}
          sous={t('profil.personnesBloqueesSous')}
          inactive
        />
        <Ligne icone="aide" titre={t('profil.aide')} sous={t('profil.aideSous')} inactive />
        <Ligne
          icone="infos"
          titre={t('profil.aPropos')}
          sous={t('profil.aProposSous')}
          onPress={() => router.push('/a-propos')}
        />
        {connecte ? (
          <Ligne
            icone="sortie"
            titre={t('profil.seDeconnecter')}
            danger
            onPress={() => setConfirmeDeconnexion(true)}
          />
        ) : null}
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

function Badge({ texte, succes = false }: { texte: string; succes?: boolean }) {
  return (
    <View
      className={`rounded-pill px-12 py-4 ${succes ? 'bg-ok' : 'bg-card'}`}
    >
      <Text
        className={`text-[12px] font-bold ${succes ? 'text-onOk' : 'text-ink'}`}
        style={chiffresTabulaires}
      >
        {texte}
      </Text>
    </View>
  );
}

function Section({ titre }: { titre: string }) {
  return (
    <Text className="mb-8 mt-24 px-16 text-[12px] font-bold uppercase tracking-wider text-muted">
      {titre}
    </Text>
  );
}

/**
 * Une ligne de réglage. 50 pt au minimum — c'est ce que vérifie l'assertion de
 * gabarit, sur les quatre tailles d'écran.
 */
function Ligne({
  nom,
  icone,
  titre,
  sous,
  onPress,
  danger = false,
  inactive = false,
}: {
  nom?: string;
  icone: NomIcone;
  titre: string;
  sous?: string;
  onPress?: () => void;
  danger?: boolean;
  inactive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      accessibilityLabel={sous ? `${titre}. ${sous}` : titre}
      disabled={inactive || !onPress}
      onPress={onPress}
      onLayout={nom ? (e) => noterMesure(nom, e.nativeEvent.layout.height) : undefined}
      className="mx-16 mb-8 min-h-[50px] flex-row items-center rounded-card bg-card px-12 py-8"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Pastille nom={icone} danger={danger} />
      <View className="ml-12 flex-1">
        <Text
          className={`text-[15px] font-bold ${
            danger ? 'text-danger' : inactive ? 'text-muted' : 'text-ink'
          }`}
        >
          {titre}
        </Text>
        {sous ? (
          <Text className="text-[12px] font-semibold text-muted">{sous}</Text>
        ) : null}
      </View>
      {onPress && !inactive ? (
        <Text className="text-[15px] font-bold text-muted">›</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Les gains, en tête de la section conducteur.
 *
 * LA SEMAINE EN GROS, le cumul en dessous : un conducteur pense en semaines —
 * carburant, versement au propriétaire du véhicule, dépense du dimanche. Un
 * total cumulé grossit toujours, il ne dit rien de « comment ça marche en ce
 * moment ».
 */
function Gains({
  gains,
}: {
  gains: { courses: number; total_xof: number; semaine_xof: number };
}) {
  const t = useT();
  return (
    <View className="mx-16 mb-8 rounded-card bg-card p-16">
      <Text className="text-[12px] font-bold uppercase tracking-wider text-muted">
        {t('profil.gainsSemaine')}
      </Text>
      <Text
        className="mt-4 text-[28px] font-extrabold text-moneyInk"
        style={chiffresTabulaires}
      >
        {formatXof(gains.semaine_xof)}
      </Text>
      <Text className="mt-4 text-[13px] font-semibold text-muted">
        {gains.courses === 0
          ? t('profil.gainsVide')
          : t('profil.gainsTotalLigne', { montant: formatXof(gains.total_xof) })}
      </Text>
    </View>
  );
}
