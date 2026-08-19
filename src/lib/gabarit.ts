/**
 * Vérification de gabarit — développement seulement.
 *
 * Une capture d'écran prouve qu'un appareil va bien un jour donné. Une mesure
 * prouve la règle sur TOUS les appareils, à chaque lancement : une tuile a le
 * droit de rogner son propre dessin, la feuille n'a jamais le droit de rogner
 * une tuile.
 *
 * Les messages ne passent pas par `src/i18n` : ils s'adressent au développeur,
 * jamais à l'utilisateur, et ne sortent pas de `__DEV__`.
 */
import { Dimensions } from 'react-native';

type Attendu = { feuilleMinimum: number; tuileMinimum: number };

const mesures: Record<string, number> = {};
let attendu: Attendu | null = null;
let planifie = false;
let deja = false;

export function configurerGabarit(valeur: Attendu) {
  if (!__DEV__) return;
  attendu = valeur;
}

/**
 * Les `onLayout` ne remontent pas dans un ordre garanti — le parent peut mesurer
 * avant ses enfants. On accumule donc, et on vérifie au tour suivant, quand tout
 * est arrivé.
 */
export function noterMesure(nom: string, hauteur: number) {
  if (!__DEV__ || deja) return;
  mesures[nom] = hauteur;

  if (planifie) return;
  planifie = true;
  setTimeout(() => {
    planifie = false;
    verifier();
  }, 0);
}

function verifier() {
  if (!attendu || deja) return;

  const feuille = mesures.feuille;
  const tuiles = [mesures.tuile0, mesures.tuile1];
  if (feuille === undefined || tuiles.some((t) => t === undefined)) return;

  deja = true;

  const { width, height } = Dimensions.get('window');
  const ecran = `${Math.round(width)}×${Math.round(height)}`;
  const echecs: string[] = [];

  if (feuille < attendu.feuilleMinimum - 0.5) {
    echecs.push(
      `feuille comprimée : ${feuille.toFixed(0)} pt pour ${attendu.feuilleMinimum} attendus`,
    );
  }

  tuiles.forEach((t, i) => {
    if (t !== undefined && t < attendu!.tuileMinimum - 0.5) {
      echecs.push(
        `tuile ${i} rognée : ${t.toFixed(0)} pt pour ${attendu!.tuileMinimum} attendus`,
      );
    }
  });

  // `console.warn` et non `console.log` : Metro ne remonte pas les `log` dans le
  // terminal, et une assertion qu'on ne voit pas ne sert à rien.
  if (echecs.length > 0) {
    console.warn(`GABARIT ✗ ${ecran} — ${echecs.join(' ; ')}`);
    return;
  }

  console.warn(
    `GABARIT ✓ ${ecran} — feuille ${feuille.toFixed(0)} pt, ` +
      `tuiles ${tuiles.map((t) => t?.toFixed(0)).join(' / ')} pt, aucune rognée`,
  );
}
