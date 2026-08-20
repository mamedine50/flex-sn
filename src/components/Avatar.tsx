import { Image, Text, View } from 'react-native';

import { useUrlPhoto } from '../lib/photos';

/**
 * L'avatar : la photo si elle existe, l'initiale sinon.
 *
 * JAMAIS un rond vide. Un rond vide se lit comme un chargement qui a échoué, et
 * la moitié des conducteurs n'auront pas de photo au début — ce serait une file
 * de trous.
 *
 * La teinte de repli est tirée du prénom, donc stable : la même personne a
 * toujours la même pastille, ce qui aide à la reconnaître d'une course à
 * l'autre. Pas de couleur en dur — quatre remplissages du thème, et l'encre qui
 * va avec chacun.
 */
// Pas d'ambre ici : `moneyFill` appartient aux montants. Une pastille de
// personne qui emprunte la couleur de l'argent affaiblit le seul signal qu'on
// veut voir de loin sur cet écran.
const TEINTES = [
  { fond: 'bg-accFill', encre: 'text-onAcc' },
  { fond: 'bg-ok', encre: 'text-onOk' },
  { fond: 'bg-card2', encre: 'text-ink' },
] as const;

function teintePour(prenom: string) {
  let somme = 0;
  for (let i = 0; i < prenom.length; i += 1) somme += prenom.charCodeAt(i);
  return TEINTES[somme % TEINTES.length] as (typeof TEINTES)[number];
}

/**
 * Deux tailles seulement : la ligne (48) et l'entête du Profil (92). Valeurs
 * entre crochets plutôt qu'échelle d'espacement — 92 n'y est pas, et une classe
 * hors échelle est ignorée par NativeWind sans un mot.
 */
const TAILLES = {
  liste: { boite: 'h-48 w-48', texte: 'text-[18px]' },
  grand: { boite: 'h-[92px] w-[92px]', texte: 'text-[36px]' },
} as const;

export default function Avatar({
  prenom,
  photo,
  taille = 'liste',
}: {
  prenom: string | null;
  /** Le CHEMIN dans `photos-profil`, pas une URL. */
  photo?: string | null;
  taille?: keyof typeof TAILLES;
}) {
  const mesure = TAILLES[taille];
  const nom = prenom?.trim() || '?';
  const uri = useUrlPhoto(photo);
  const teinte = teintePour(nom);

  // La géométrie passe par des classes : à côté d'un `className`, un `style`
  // serait ignoré sans un mot.
  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={nom}
        className={`${mesure.boite} rounded-pill`}
      />
    );
  }

  return (
    <View
      accessibilityLabel={nom}
      className={`${mesure.boite} items-center justify-center rounded-pill ${teinte.fond}`}
    >
      <Text className={`${mesure.texte} font-extrabold ${teinte.encre}`}>
        {nom.slice(0, 1).toLocaleUpperCase('fr')}
      </Text>
    </View>
  );
}
