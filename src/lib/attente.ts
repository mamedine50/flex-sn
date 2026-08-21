/**
 * Depuis combien de temps un dossier attend.
 *
 * Module PUR, sans client Supabase : `src/lib/supabase.ts` échoue au chargement
 * sans variables d'environnement, et un test n'en a pas.
 */
/** Depuis combien de temps ce dossier attend. */
export function attenteDepuis(depuis: string | null): { unite: 'jours' | 'heures' | 'minutes'; n: number } {
  const ms = Date.now() - new Date(depuis ?? Date.now()).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes >= 1440) return { unite: 'jours', n: Math.floor(minutes / 1440) };
  if (minutes >= 60) return { unite: 'heures', n: Math.floor(minutes / 60) };
  return { unite: 'minutes', n: minutes };
}
