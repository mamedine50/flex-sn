import type { Couleurs } from './ThemeProvider';

/**
 * Style Google Maps dérivé des jetons. Aucun hex n'est écrit ici : la carte est
 * une surface de l'application, elle suit le thème comme le reste.
 *
 * Ne s'applique qu'au fournisseur Google. Sur Apple Plans — le repli quand
 * aucune clé n'est configurée — la carte garde son apparence par défaut.
 */
export function styleCarte(couleurs: Couleurs) {
  const teinte = (element: string, color: string) => ({
    elementType: element,
    stylers: [{ color }],
  });

  return [
    // Rien d'autre que la géographie : ni commerces, ni transports, ni
    // étiquettes de points d'intérêt. La carte est un fond, pas un annuaire.
    { featureType: 'poi', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },

    teinte('geometry', couleurs.map),
    teinte('labels.text.fill', couleurs.muted),
    teinte('labels.text.stroke', couleurs.map),

    { featureType: 'water', ...teinte('geometry', couleurs.water) },
    { featureType: 'road', ...teinte('geometry', couleurs.road) },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape.man_made', ...teinte('geometry', couleurs.block) },
  ];
}
