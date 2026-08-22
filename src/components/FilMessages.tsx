import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../i18n';
import { masquerGrossieretes } from '../lib/filtreMots';
import { heure24 } from '../lib/format';
import { configurerGabarit, noterMesure } from '../lib/gabarit';
import { envoyer, useFil } from '../lib/messagerie';
import { useTheme } from '../theme/ThemeProvider';
import Avatar from './Avatar';

/**
 * Le fil d'une course.
 *
 * ── CE QU'IL REMPLACE ──────────────────────────────────────────────────────
 * Le bouton « Écrire » ouvrait l'application SMS du téléphone. Les deux numéros
 * partaient avec, et ne revenaient jamais : la course finit, la RLS se referme,
 * mais le numéro est déjà dans le répertoire d'en face. Ce fil ferme la porte —
 * on discute sans jamais échanger de numéro.
 *
 * ── L'EN-TÊTE NE PORTE JAMAIS DE NUMÉRO ────────────────────────────────────
 * Prénom, modèle, couleur, plaque. C'est tout, et c'est suffisant : ce qu'on
 * cherche dans un fil de course, c'est reconnaître la voiture qui arrive. La
 * plaque le fait, le numéro non.
 *
 * ── LE FILTRE EST À L'AFFICHAGE ────────────────────────────────────────────
 * `masquerGrossieretes` s'applique en LISANT, pas en écrivant. On ne réécrit
 * pas ce que quelqu'un a envoyé — un signalement doit pouvoir montrer le texte
 * réel — on choisit seulement ce qu'on en montre.
 */

/**
 * Quatre hauteurs mesurées, et chacune protège autre chose : l'en-tête dit à
 * qui on parle, les réponses rapides sont la moitié des échanges d'une course,
 * la barre est le seul endroit où l'on écrit, et le bandeau porte la promesse
 * sur laquelle tout ce fil repose. Aucune ne peut disparaître en silence.
 */
const GABARIT = { filEntete: 56, filRapides: 40, filBarre: 48, filBandeau: 24 };

/** Les quatre phrases qui font l'essentiel d'un échange de course, dans les deux sens. */
const RAPIDES = [
  'fil.rapide_jarrive',
  'fil.rapide_jesuisla',
  'fil.rapide_deuxminutes',
  'fil.rapide_ouetesvous',
] as const;

export default function FilMessages({
  courseId,
  monId,
  prenom,
  photo,
  vehicule,
  ouvert,
  onFermer,
}: {
  courseId: string;
  monId: string | null;
  prenom: string | null;
  photo?: string | null;
  vehicule?: { modele: string; couleur: string; plaque: string } | null;
  /** Faux quand la course est finie : on lit encore, on n'écrit plus. */
  ouvert: boolean;
  onFermer: () => void;
}) {
  const t = useT();
  const { couleurs } = useTheme();
  const marges = useSafeAreaInsets();
  const fil = useFil(courseId);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const defilement = useRef<ScrollView>(null);

  configurerGabarit('fil', GABARIT);

  // Le fil se lit par le bas : un message qui arrive hors de l'écran est un
  // message qu'on n'a pas reçu.
  useEffect(() => {
    if (fil.messages.length === 0) return;
    const tache = setTimeout(() => defilement.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(tache);
  }, [fil.messages.length]);

  const soumettre = async (contenu: string) => {
    const propre = contenu.trim();
    if (!propre || occupe) return;
    setOccupe(true);
    setErreur(null);
    const resultat = await envoyer(courseId, propre);
    setOccupe(false);
    if (resultat.ok) {
      setTexte('');
      // On ne pose PAS le message localement : Realtime déclenche la relecture,
      // et le serveur fait foi. Un message affiché avant d'être écrit ment sur
      // ce qui est parti.
      return;
    }
    setErreur(resultat.cle === 'ferme' ? t('fil.ferme') : t('fil.erreurEnvoi'));
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 bg-bg"
      >
        {/* ── EN-TÊTE : à qui je parle, et quelle voiture je cherche ── */}
        <View
          onLayout={(e) => noterMesure('filEntete', e.nativeEvent.layout.height)}
          className="flex-row items-center gap-12 bg-card px-16 pb-12 pt-48"
        >
          <Avatar prenom={prenom} photo={photo} />
          <View className="flex-1">
            <Text className="text-[17px] font-extrabold text-ink" numberOfLines={1}>
              {prenom ?? t('fil.titre')}
            </Text>
            {vehicule ? (
              <Text className="text-[12px] font-semibold text-muted" numberOfLines={1}>
                {vehicule.modele} {vehicule.couleur} · {vehicule.plaque}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('fil.fermer')}
            onPress={onFermer}
            className="min-h-touch justify-center px-12"
          >
            <Text className="text-[15px] font-bold text-accInk">{t('fil.fermer')}</Text>
          </Pressable>
        </View>

        {/* ── LES BULLES ── */}
        <ScrollView
          ref={defilement}
          className="flex-1"
          contentContainerClassName="gap-8 px-16 py-16"
          keyboardShouldPersistTaps="handled"
        >
          {fil.statut === 'pret' && fil.messages.length === 0 ? (
            <Text className="mt-32 text-center text-[14px] font-semibold text-muted">
              {t('fil.vide')}
            </Text>
          ) : null}

          {fil.messages.map((message) => {
            const moi = message.expediteur_id === monId;
            return (
              <View
                key={message.id}
                className={`max-w-[80%] rounded-card px-16 py-8 ${
                  moi ? 'self-end bg-accFill' : 'self-start bg-card2'
                }`}
              >
                <Text className={`text-[15px] font-semibold ${moi ? 'text-onAcc' : 'text-ink'}`}>
                  {masquerGrossieretes(message.contenu)}
                </Text>
                <Text
                  className={`mt-4 text-[11px] font-semibold ${moi ? 'text-onAcc' : 'text-muted'}`}
                >
                  {heure24(message.cree_le)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {erreur !== null ? (
          <View className="mx-16 mb-8 rounded-field bg-card px-16 py-8">
            <Text className="text-[13px] font-bold text-danger">{erreur}</Text>
          </View>
        ) : null}

        <View style={{ paddingBottom: marges.bottom + 8 }} className="bg-card px-16 pt-8">
          {/* ── RÉPONSES RAPIDES : la moitié des échanges d'une course ──
              Elles restent MESURÉES même fermées : sinon l'assertion de gabarit
              n'aboutirait jamais sur un fil clos, et c'est justement là qu'on
              voudrait savoir que la barre a la bonne hauteur. */}
          <View
            onLayout={(e) => noterMesure('filRapides', e.nativeEvent.layout.height)}
            className="flex-row flex-wrap gap-8"
          >
            {ouvert
              ? RAPIDES.map((cle) => (
                  <Pressable
                    key={cle}
                    accessibilityRole="button"
                    accessibilityLabel={t(cle)}
                    disabled={occupe}
                    onPress={() => void soumettre(t(cle))}
                    className="min-h-touch justify-center rounded-pill bg-card2 px-16"
                    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                  >
                    <Text className="text-[13px] font-bold text-accInk">{t(cle)}</Text>
                  </Pressable>
                ))
              : null}
          </View>

          {/* ── LA BARRE ── */}
          <View
            onLayout={(e) => noterMesure('filBarre', e.nativeEvent.layout.height)}
            className="mt-8 flex-row items-center gap-8"
          >
            {ouvert ? (
              <>
                <TextInput
                  value={texte}
                  onChangeText={setTexte}
                  placeholder={t('fil.champ')}
                  placeholderTextColor={couleurs.muted}
                  multiline
                  maxLength={1000}
                  className="min-h-touch flex-1 rounded-field bg-card2 px-16 py-12 text-[15px] font-semibold text-ink"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('fil.envoyer')}
                  accessibilityState={{ disabled: texte.trim() === '' || occupe }}
                  disabled={texte.trim() === '' || occupe}
                  onPress={() => void soumettre(texte)}
                  // Un état désactivé change de COULEUR, pas seulement
                  // d'opacité : un aplat clair à 50 % reste lumineux et le
                  // bouton a l'air actif.
                  className={`min-h-touch justify-center rounded-field px-16 ${
                    texte.trim() === '' || occupe ? 'bg-card2' : 'bg-accFill'
                  }`}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                >
                  <Text
                    className={`text-[14px] font-extrabold ${
                      texte.trim() === '' || occupe ? 'text-muted' : 'text-onAcc'
                    }`}
                  >
                    {t('fil.envoyer')}
                  </Text>
                </Pressable>
              </>
            ) : (
              <View className="min-h-touch flex-1 justify-center rounded-field bg-card2 px-16">
                <Text className="text-[13px] font-bold text-muted">{t('fil.ferme')}</Text>
              </View>
            )}
          </View>

          {/* ── LA PROMESSE, ÉCRITE ──
              Elle n'est pas décorative : c'est la seule chose qui explique
              pourquoi on écrit ICI plutôt que par SMS. Sans elle, le fil interne
              ressemble à une contrainte, pas à une protection. */}
          <Text
            onLayout={(e) => noterMesure('filBandeau', e.nativeEvent.layout.height)}
            className="mt-8 text-[11px] font-semibold text-muted"
          >
            {t('fil.confidentialite')}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
