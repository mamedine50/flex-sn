/**
 * Où mène une notification.
 *
 * ── UN SEUL ENDROIT POUR DEUX CHEMINS ──────────────────────────────────────
 * La même question se pose deux fois : quand on appuie sur une ligne de la
 * boîte, et quand on appuie sur un push reçu écran verrouillé. C'était écrit
 * deux fois. Deux copies d'une table de correspondance divergent au premier
 * genre ajouté — et le second endroit, celui qu'on oublie, est justement celui
 * qu'on ne peut pas tester à la main.
 *
 * ── UN APPUI MÈNE TOUJOURS QUELQUE PART ────────────────────────────────────
 * Le repli sur la boîte n'est pas de la politesse : le jour où quelqu'un ajoute
 * un genre en base sans passer ici, la notification s'affichera et l'appui
 * n'irait nulle part. Personne ne saurait pourquoi. Avec le repli, on atterrit
 * au moins là où la notification est lisible.
 *
 * Pas de dépendance native ici, et c'est ce qui la rend éprouvable : `push.ts`
 * importe `expo-notifications`, qui n'existe pas hors d'un téléphone.
 */
export function cheminNotification(genre: string | null | undefined): string {
  switch (genre) {
    case 'offre_recue':
    case 'contre_offre':
    case 'demande_expiree':
      return '/offres';
    case 'offre_acceptee':
    case 'conducteur_arrive':
    case 'message':
      return '/course';
    case 'course_annulee':
      return '/historique';
    case 'document_decide':
      return '/devenir-conducteur';
    default:
      // `offre_caduque` compris : la course est partie ailleurs, il n'y a rien
      // à ouvrir — mais la boîte, elle, explique pourquoi.
      return '/notifications';
  }
}
