import { useState } from 'react';
import { Modal, Pressable, Text, TextInput } from 'react-native';

import { useT } from '../i18n';
import { bloquer } from '../lib/blocages';
import { cleErreur } from '../lib/erreursServeur';

/**
 * Bloquer quelqu'un — et l'endroit où cette décision se prend.
 *
 * ── POURQUOI CE N'EST PLUS SUR L'ÉCRAN DE COURSE ───────────────────────────
 * Le bouton vivait à côté d'« Annuler la course », pendant le trajet. Trois
 * choses n'allaient pas :
 *
 *   1. DEUX ROUGES QUI SE DISPUTENT L'ŒIL. « Bloquer » et « Annuler la course »
 *      étaient empilés dans la même couleur. En cas de problème réel il faut
 *      UNE action évidente, pas deux également alarmantes.
 *   2. BLOQUER NE CHANGE RIEN AU MOMENT PRÉSENT. On est dans la voiture avec la
 *      personne. Le blocage n'agit que sur les appariements FUTURS — il ne
 *      protège pas de ce qui se passe maintenant, et le proposer là le laisse
 *      croire.
 *   3. LA DÉCISION EST RÉTROSPECTIVE. « Je ne veux plus de cette personne » se
 *      décide une fois descendu, pas au volant ni sur la banquette.
 *
 * Elle vit donc dans l'historique, à côté de « Signaler » — les deux gestes
 * d'après-course, au même endroit, ce qui est aussi ce qu'Apple demande de
 * pouvoir trouver.
 *
 * L'ANNULATION, elle, reste sur l'écran de course : c'est la seule action de
 * cet écran qui agit sur MAINTENANT, et elle y est désormais seule en rouge.
 */
export default function FeuilleBlocage({
  profilId,
  prenom,
  onFermer,
}: {
  profilId: string;
  prenom: string;
  /** `true` quand le blocage a été posé : l'appelant peut afficher sa confirmation. */
  onFermer: (bloque: boolean) => void;
}) {
  const t = useT();
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  const poser = async () => {
    setOccupe(true);
    setEchec(null);
    const { error } = await bloquer(profilId, motif);
    setOccupe(false);
    if (error) {
      setEchec(t(cleErreur(error)));
      return;
    }
    onFermer(true);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onFermer(false)}>
      <Pressable
        className="flex-1 items-center justify-center bg-bg/70 px-24"
        onPress={() => onFermer(false)}
      >
        <Pressable className="w-full rounded-card bg-card p-16">
          <Text className="text-[17px] font-extrabold text-ink">
            {t('blocages.confirmer', { prenom })}
          </Text>
          <Text className="mt-8 text-[13px] font-semibold text-muted">
            {t('blocages.confirmerAide')}
          </Text>

          <Text className="mt-16 text-[12px] font-bold uppercase tracking-wider text-muted">
            {t('blocages.motif')}
          </Text>
          <TextInput
            value={motif}
            onChangeText={(v) => setMotif(v.slice(0, 300))}
            placeholder={t('blocages.motifIndice')}
            accessibilityLabel={t('blocages.motif')}
            className="mt-4 min-h-touch rounded-field bg-card2 px-12 text-[14px] font-semibold text-ink"
          />

          {echec ? (
            <Text className="mt-8 text-[13px] font-bold text-danger">{echec}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: occupe }}
            disabled={occupe}
            onPress={() => void poser()}
            className="mt-16 min-h-driving items-center justify-center rounded-button bg-card2"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[15px] font-extrabold text-danger">
              {t('blocages.bloquer')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onFermer(false)}
            className="mt-8 min-h-driving items-center justify-center rounded-button bg-accFill"
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <Text className="text-[15px] font-extrabold text-onAcc">{t('commun.annuler')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
