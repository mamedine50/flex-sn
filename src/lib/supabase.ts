import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from './database.types';
import { stockageSecurise } from './stockageSecurise';

/**
 * Le client Supabase. UN SEUL, pour toute l'application.
 *
 * Un client par écran ouvrirait un canal Realtime par écran, referait
 * l'authentification à chaque montage, et la session divergerait d'un écran à
 * l'autre.
 *
 * **Clé anonyme uniquement.** La clé `service_role` contourne toute la RLS : si
 * elle entre un jour dans ce fichier, elle part dans le bundle, et le bundle
 * est lisible par n'importe qui. Toute la confidentialité de Flex — nom,
 * numéro, position exacte — repose sur des policies que cette clé annulerait.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const cleAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !cleAnon) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY sont requis. Copiez .env.example vers .env.',
  );
}

// Garde-fou : une clé de service porte `"role":"service_role"` dans sa charge
// utile. On préfère un échec au démarrage à une fuite silencieuse.
if (cleAnon.includes('service_role')) {
  throw new Error(
    'La clé fournie est une clé service_role. Elle contourne la RLS et ne doit jamais entrer dans le client.',
  );
}

export const supabase = createClient<Database>(url, cleAnon, {
  auth: {
    storage: stockageSecurise,
    autoRefreshToken: true,
    persistSession: true,
    // Pas de session dans l'URL : il n'y a pas de navigateur ici, et l'activer
    // fait chercher un fragment qui n'existe pas.
    detectSessionInUrl: false,
  },
});

/**
 * Le rafraîchissement automatique ne tourne que quand l'application est au
 * premier plan. En arrière-plan il réveillerait le réseau pour rien — et sur un
 * forfait sénégalais, le réseau se paie.
 */
AppState.addEventListener('change', (etat) => {
  if (etat === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
