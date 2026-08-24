import { Pressable, Text, View } from 'react-native';

/**
 * Un écran qui n'a rien à montrer.
 *
 * ── IL ÉTAIT ÉCRIT QUATRE FOIS ─────────────────────────────────────────────
 * Historique, avis, personnes bloquées, notifications : quatre copies du même
 * composant, à quatre endroits. Elles n'avaient pas encore divergé — mais c'est
 * la seule raison pour laquelle le défaut ci-dessous était le même partout.
 *
 * ── UNE ERREUR DOIT AVOIR UNE SORTIE ──────────────────────────────────────
 * Les états d'erreur — « Impossible de charger vos notifications » — ne
 * portaient AUCUNE action. On lisait que ça avait échoué, et il ne restait
 * qu'à revenir en arrière et espérer. Un réseau sénégalais coupe souvent une
 * requête sur deux : l'échec est l'ordinaire, pas l'exception, et « Réessayer »
 * est l'action la plus fréquente du produit.
 *
 * La règle du dépôt le disait déjà : les erreurs disent ce qui s'est passé ET
 * quoi faire. La moitié manquait.
 *
 * ── UN VIDE N'EST PAS UNE ERREUR ──────────────────────────────────────────
 * « Aucune course terminée » n'a rien à réessayer : la réponse est arrivée, et
 * elle est vide. D'où `onReessayer` OPTIONNEL — le bouton n'apparaît que là où
 * il a un sens. Un « Réessayer » sous un écran vide légitime laisserait croire
 * que quelque chose a échoué.
 */
export default function Vide({
  titre,
  aide,
  onReessayer,
  libelleReessayer,
}: {
  titre: string;
  aide?: string;
  onReessayer?: () => void;
  libelleReessayer?: string;
}) {
  return (
    <View className="mx-16 mt-24 rounded-card bg-card p-16">
      <Text className="text-[15px] font-bold text-ink">{titre}</Text>
      {aide ? (
        <Text className="mt-4 text-[13px] font-semibold text-muted">{aide}</Text>
      ) : null}
      {onReessayer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={libelleReessayer}
          onPress={onReessayer}
          className="mt-12 min-h-touch items-center justify-center rounded-field bg-card2"
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Text className="text-[14px] font-bold text-accInk">{libelleReessayer}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
