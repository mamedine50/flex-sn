/**
 * Le prix affiché doit-il céder à la recommandation ?
 *
 * ── LE DÉFAUT QU'ELLE CORRIGE ──────────────────────────────────────────────
 * La règle était « on n'écrase jamais une saisie de l'utilisateur ». Trop
 * large : elle traitait un prix tapé AVANT qu'un trajet existe comme un choix
 * délibéré. Or il n'y avait rien sur quoi se baser — ni distance, ni
 * recommandation. On choisissait 2 000 dans le vide, on désignait ensuite
 * Mermoz, et le chiffre ne bougeait pas. L'écran avait l'air de ne rien
 * calculer.
 *
 * ── LA RÈGLE ──────────────────────────────────────────────────────────────
 * Un prix est une RÉPONSE À UN TRAJET PRÉCIS. Tant que la réponse n'a pas été
 * donnée pour CE trajet, la recommandation reprend la main. Dès qu'elle l'a
 * été, plus rien ne l'écrase — jusqu'au prochain changement de trajet, qui
 * rend cette réponse caduque à son tour.
 *
 * Sortie de l'écran pour être éprouvée : c'est une règle de trois lignes qu'on
 * ne peut pas tester à travers un champ de saisie et un aller-retour réseau.
 */
export function ancrePrix({
  prix,
  repondu,
  recommande,
}: {
  /** Ce qu'affiche le champ. `null` = vide. */
  prix: number | null;
  /** Le prix affiché a-t-il été choisi pour le trajet COURANT ? */
  repondu: boolean;
  /** La recommandation pour le trajet courant. `null` = tarif non renseigné. */
  recommande: number | null;
}): number | null {
  // Sans recommandation, il n'y a rien à proposer : on ne touche à rien.
  if (recommande === null) return prix;
  return repondu && prix !== null ? prix : recommande;
}
