import { useState } from 'react';
import { Modal, Pressable, Text } from 'react-native';

import { useT } from '../i18n';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

/**
 * Signaler un comportement ou un avis.
 *
 * Elle ne demande QUE la course et un motif. Elle ne demande pas qui signaler :
 * le serveur déduit l'autre bout de la course lui-même. C'est ce qui permet de
 * signaler un avis sans jamais apprendre qui l'a écrit — le double aveugle
 * tiendrait mal si l'écran devait nommer la personne pour la dénoncer.
 *
 * Les motifs sont une LISTE. Un champ libre serait un second gisement de
 * contenu utilisateur, à modérer à son tour.
 */
type Motif = Database['public']['Enums']['motif_signalement'];

const MOTIFS: readonly Motif[] = [
  'insulte',
  'conduite_dangereuse',
  'fraude',
  'harcelement',
  'autre',
];

export default function FeuilleSignalement({
  courseId,
  porteSurAvis = false,
  ouverte,
  onFermer,
}: {
  courseId: string;
  porteSurAvis?: boolean;
  ouverte: boolean;
  onFermer: (envoye: boolean) => void;
}) {
  const t = useT();
  const [envoi, setEnvoi] = useState(false);
  const [echec, setEchec] = useState(false);

  const envoyer = async (motif: Motif) => {
    setEnvoi(true);
    setEchec(false);
    const { error } = await supabase.rpc('signaler', {
      p_course_id: courseId,
      p_motif: motif,
      p_porte_sur_avis: porteSurAvis,
    });
    setEnvoi(false);
    if (error) {
      setEchec(true);
      return;
    }
    onFermer(true);
  };

  return (
    <Modal visible={ouverte} transparent animationType="fade">
      <Pressable
        className="flex-1 justify-end bg-bg/70"
        onPress={() => onFermer(false)}
      >
        <Pressable className="rounded-card bg-card p-16">
          <Text className="text-[17px] font-extrabold text-ink">
            {t('signalement.titre')}
          </Text>
          <Text className="mt-4 text-[13px] font-semibold text-muted">
            {t('signalement.texte')}
          </Text>

          {echec ? (
            <Text className="mt-8 text-[13px] font-semibold text-danger">
              {t('signalement.echec')}
            </Text>
          ) : null}

          {MOTIFS.map((motif) => (
            <Pressable
              key={motif}
              accessibilityRole="button"
              disabled={envoi}
              onPress={() => void envoyer(motif)}
              className={`mt-8 min-h-driving justify-center rounded-button px-16 ${
                envoi ? 'bg-card2' : 'bg-card2'
              }`}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                className={`text-[15px] font-bold ${envoi ? 'text-muted' : 'text-ink'}`}
              >
                {t(`signalement.${motif}`)}
              </Text>
            </Pressable>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => onFermer(false)}
            className="mt-16 min-h-driving items-center justify-center rounded-button bg-accFill"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[15px] font-extrabold text-onAcc">
              {t('commun.annuler')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
