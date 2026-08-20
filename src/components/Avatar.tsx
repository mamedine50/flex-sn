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

export default function Avatar({
  prenom,
  photo,
}: {
  prenom: string | null;
  /** Le CHEMIN dans `photos-profil`, pas une URL. */
  photo?: string | null;
}) {
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
        className="h-48 w-48 rounded-pill"
      />
    );
  }

  return (
    <View
      accessibilityLabel={nom}
      className={`h-48 w-48 items-center justify-center rounded-pill ${teinte.fond}`}
    >
      <Text className={`text-[18px] font-extrabold ${teinte.encre}`}>
        {nom.slice(0, 1).toLocaleUpperCase('fr')}
      </Text>
    </View>
  );
}
