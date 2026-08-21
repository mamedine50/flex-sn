import { router } from 'expo-router';
import { Linking } from 'react-native';

/**
 * Les deux documents légaux : UNE seule source de vérité, hébergée.
 *
 * Le texte publié vit sur GitHub Pages, hors de l'application. C'est la seule
 * version qui compte : c'est celle qu'Apple lit, celle qu'un juriste corrigera,
 * et celle qui se met à jour sans publier une version de l'application. Deux
 * textes à maintenir, c'est un texte à jour et un texte faux.
 *
 * LE REPLI EXISTE ET N'EST PAS UN SECOND TEXTE. Tant qu'aucune URL n'est
 * configurée — développement, ou variable oubliée — on ouvre la page interne
 * plutôt que de laisser un lien mort. Un lien légal qui ne fait rien est pire
 * qu'un lien qui mène à une trame marquée provisoire : le premier ressemble à
 * une application cassée, le second dit ce qu'il est.
 *
 * `openURL` peut échouer — pas de navigateur, URL malformée, réseau coupé au
 * moment du clic. On retombe alors sur la page interne au lieu d'avaler
 * l'erreur : l'utilisateur a demandé à lire un document, il doit en voir un.
 */
export const URL_CONDITIONS = process.env.EXPO_PUBLIC_URL_CONDITIONS ?? '';
export const URL_CONFIDENTIALITE = process.env.EXPO_PUBLIC_URL_CONFIDENTIALITE ?? '';

export type Document = 'conditions' | 'confidentialite';

/** `https` seulement : une URL légale ne s'ouvre pas en clair. */
function hebergee(document: Document): string | null {
  const url = document === 'conditions' ? URL_CONDITIONS : URL_CONFIDENTIALITE;
  return url.startsWith('https://') ? url : null;
}

export function ouvrirDocument(document: Document): void {
  const interne = document === 'conditions' ? '/conditions' : '/confidentialite';
  const url = hebergee(document);

  if (!url) {
    router.push(interne);
    return;
  }

  void Linking.openURL(url).catch(() => router.push(interne));
}
