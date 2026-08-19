import type { TextStyle } from 'react-native';

/**
 * Chiffres tabulaires. Obligatoire sur tout montant susceptible de changer :
 * sans ça le prix tressaute à chaque appui sur `+` et l'application paraît
 * cassée.
 *
 *   <Text style={chiffresTabulaires} className="text-moneyInk">…</Text>
 */
export const chiffresTabulaires: TextStyle = {
  fontVariant: ['tabular-nums'],
};
