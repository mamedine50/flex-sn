/**
 * Vérification de gabarit — développement seulement.
 *
 * Une capture prouve un appareil un jour donné. Une assertion mesurée prouve la
 * règle partout, à chaque lancement. Tout écran à gabarit contraint porte la
 * sienne : on déclare les hauteurs minimales attendues, chaque bloc se mesure
 * par `onLayout`, et l'écart sort dans la console.
 *
 * Le défaut qui a motivé cet outil : NativeWind ignore, sans avertissement, une
 * géométrie passée en `style` inline à côté d'un `className`. Les tuiles de
 * l'accueil faisaient 88 pt au lieu de 152 et rien ne le disait.
 *
 * Les messages ne passent pas par `src/i18n` : ils s'adressent au développeur.
 */
import { Dimensions } from 'react-native';

type Minima = Record<string, number>;

let ecranCourant: string | null = null;
let minima: Minima = {};
let mesures: Record<string, number> = {};
let planifie = false;
let rendu = false;

/**
 * Déclare ce qu'on attend. Rappelée à chaque rendu — changer d'écran remet le
 * compteur à zéro, sinon la seconde assertion se ferait avec les mesures de la
 * première.
 */
export function configurerGabarit(ecran: string, attendu: Minima) {
  if (!__DEV__) return;
  if (ecranCourant === ecran) return;

  // Un écran peut avoir plusieurs variantes — `offres` et `offres+liste` — quand
  // une partie n'apparaît qu'avec des données. On garde alors les mesures déjà
  // prises : les blocs communs ne se remesurent pas, et les jeter empêcherait
  // l'assertion de la variante de jamais aboutir.
  const memeEcran = ecranCourant?.split('+')[0] === ecran.split('+')[0];

  ecranCourant = ecran;
  minima = attendu;
  if (!memeEcran) mesures = {};
  rendu = false;
}

/**
 * Les `onLayout` ne remontent pas dans un ordre garanti — un parent peut
 * mesurer avant ses enfants. On accumule, et on vérifie au tour suivant.
 */
export function noterMesure(nom: string, hauteur: number) {
  if (!__DEV__ || rendu) return;
  mesures[nom] = hauteur;

  if (planifie) return;
  planifie = true;
  setTimeout(() => {
    planifie = false;
    verifier();
  }, 0);
}

function verifier() {
  if (!__DEV__ || rendu || !ecranCourant) return;

  const attendus = Object.keys(minima);
  if (attendus.some((nom) => mesures[nom] === undefined)) return;

  rendu = true;

  const { width, height } = Dimensions.get('window');
  const taille = `${Math.round(width)}×${Math.round(height)}`;

  const echecs = attendus
    .filter((nom) => (mesures[nom] as number) < (minima[nom] as number) - 0.5)
    .map(
      (nom) =>
        `${nom} ${(mesures[nom] as number).toFixed(0)} pt pour ${minima[nom]} attendus`,
    );

  // `console.warn` et non `console.log` : Metro ne remonte pas les `log` dans le
  // terminal, et une assertion qu'on ne voit pas ne sert à rien.
  if (echecs.length > 0) {
    console.warn(`GABARIT ✗ ${ecranCourant} ${taille} — ${echecs.join(' ; ')}`);
    return;
  }

  const detail = attendus
    .map((nom) => `${nom} ${(mesures[nom] as number).toFixed(0)}`)
    .join(', ');
  console.warn(`GABARIT ✓ ${ecranCourant} ${taille} — ${detail} pt, rien de rogné`);
}
