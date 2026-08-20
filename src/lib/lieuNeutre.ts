/**
 * Ce qu'un favori devient quand il quitte l'écran de son propriétaire.
 *
 * `destination_libelle` est servi AU CONDUCTEUR par `demandes_ouvertes`. Y
 * laisser passer « Domicile » ou « immeuble bleu, 3e étage » annulerait tout le
 * travail de maille et de commune : on aurait flouté le point et nommé la porte.
 *
 * Le favori porte donc deux noms. `libelle` part au serveur et reste neutre ;
 * `prive` ne sert qu'à l'affichage chez celui qui l'a enregistré.
 *
 * Module PUR, sans client Supabase : c'est ce qui le rend testable.
 */
export type FavoriBrut = {
  lat: number;
  lon: number;
  type: 'domicile' | 'travail' | 'autre';
  libelle: string | null;
  precision_texte: string | null;
};

export type LieuNeutre = {
  lat: number;
  lon: number;
  /** Ce qui part au serveur. Jamais le nom privé. */
  libelle: string;
  /** Ce qu'on affiche à son propriétaire, et à lui seul. */
  prive: string;
};

export function lieuDepuisFavori(
  favori: FavoriBrut,
  libelleNeutre: string,
  nomAffiche: string,
): LieuNeutre {
  return {
    lat: favori.lat,
    lon: favori.lon,
    // Volontairement indépendant du favori : aucune de ses chaînes n'entre ici.
    libelle: libelleNeutre,
    prive: nomAffiche,
  };
}
