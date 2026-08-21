import AccueilPassager from '../../src/components/AccueilPassager';
import MaisonConducteur from '../../src/components/MaisonConducteur';
import { useEstConducteur } from '../../src/lib/conducteur';
import { useMonde } from '../../src/lib/monde';
import { entrerMondeConducteur, revenirMondePassager } from '../../src/lib/mondeEntree';

/**
 * L'onglet « Course » — et LE choix du monde.
 *
 * Deux mondes, une bascule, pas de tiroir. Le passager par défaut ; le
 * conducteur seulement pour qui en a la capacité, et seulement après un geste.
 * Cet écran ne fait que choisir : tout le reste vit dans les deux composants,
 * qui n'ont rien en commun et ne doivent rien avoir en commun.
 *
 * Le choix se fait ICI plutôt que par une route séparée parce que la barre
 * d'onglets ne bouge pas : « Course » rend la maison du conducteur tant qu'on
 * est dans son monde, et Profil reste Profil.
 */
export default function Onglet() {
  const { monde, pret } = useMonde();
  const capacite = useEstConducteur();

  // Tant qu'on ne sait pas, on montre le monde passager : c'est le défaut, et
  // il ne coûte rien d'y passer une fraction de seconde. L'inverse — ouvrir sur
  // la maison du conducteur puis la retirer — se lirait comme un bogue.
  const conducteur = pret && monde === 'conducteur' && capacite === 'oui';

  return conducteur ? (
    <MaisonConducteur onModePassager={revenirMondePassager} />
  ) : (
    <AccueilPassager onPasserEnLigne={entrerMondeConducteur} />
  );
}
