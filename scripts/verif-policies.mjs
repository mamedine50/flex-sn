// Aller-retour RÉEL contre le projet distant, avec la clé anon et une vraie
// session. C'est là qu'on découvre les grants manquants : un test local tourne
// en `postgres`, qui traverse tout.
//
//   node scripts/verif-policies.mjs
//
// Demande deux comptes jetables sur le distant (verif-policies@flex.test et
// verif-temoin@flex.test) — voir le compte rendu de l'étape 3. Ne PAS le lancer
// contre une base qui porte de vraies données : il crée une demande de course.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const resultats = [];
const verifier = (nom, ok, detail = '') =>
  resultats.push(`${ok ? '✓' : '✗'} ${nom.padEnd(58)}${detail}`);

// ------------------------------------------------ anonyme : rien ne passe --
{
  const { data, error } = await sb.from('bornes_prix').select('*');
  verifier('anonyme ne lit pas bornes_prix', !data?.length, error ? '' : `${data?.length ?? 0} lignes`);
  const rpc = await sb.rpc('create_ride_request', {
    p_service: 'urbain', p_depart_lat: 14.69, p_depart_lon: -17.44,
    p_depart_libelle: 'Plateau', p_destination_lat: 14.72, p_destination_lon: -17.49,
    p_destination_libelle: 'Ouakam', p_prix_xof: 2500,
  });
  verifier('anonyme ne peut pas créer de demande', Boolean(rpc.error), rpc.error?.message ?? '');
}

// -------------------------------------------------------------- session --
const { data: session, error: erreurAuth } = await sb.auth.signInWithPassword({
  email: 'verif-policies@flex.test', password: 'verif-policies-2026',
});
if (erreurAuth) { console.log('ÉCHEC session :', erreurAuth.message); process.exit(1); }
verifier('session ouverte avec la clé anon', Boolean(session.session), session.user.id);

// ------------------------------------------------- lectures autorisées --
{
  const { data } = await sb.from('bornes_prix').select('service, min_xof, max_xof').order('service');
  verifier('bornes_prix lisible une fois connecté', data?.length === 2,
    data ? data.map((b) => `${b.service} ${b.min_xof}–${b.max_xof}`).join(' · ') : '');
}

// ------------------------------------------------ écriture directe : non --
{
  const { error } = await sb.from('ride_requests').insert({
    passager_id: session.user.id, service: 'urbain',
    depart_lat: 14.69, depart_lon: -17.44, depart_libelle: 'Plateau',
    destination_lat: 14.72, destination_lon: -17.49, destination_libelle: 'Ouakam',
    prix_xof: 2500, expires_at: new Date(Date.now() + 300000).toISOString(),
  });
  verifier('insert direct dans ride_requests REFUSÉ', Boolean(error), error?.code ?? '');
}

// ------------------------------------------------------------ les RPC --
{
  const { error } = await sb.rpc('create_ride_request', {
    p_service: 'urbain', p_depart_lat: 14.69, p_depart_lon: -17.44,
    p_depart_libelle: 'Plateau', p_destination_lat: 14.72, p_destination_lon: -17.49,
    p_destination_libelle: 'Ouakam', p_prix_xof: 300,
  });
  verifier('prix hors bornes refusé par le serveur', error?.message === 'prix_hors_bornes',
    error?.message ?? 'aucune erreur');
}
let demandeId = null;
{
  const { data, error } = await sb.rpc('create_ride_request', {
    p_service: 'urbain', p_depart_lat: 14.6928, p_depart_lon: -17.4467,
    p_depart_libelle: 'Rue Carnot 12, Plateau', p_destination_lat: 14.7220,
    p_destination_lon: -17.4900, p_destination_libelle: 'Ouakam', p_prix_xof: 2500,
  });
  demandeId = data?.id ?? null;
  verifier('create_ride_request passe', Boolean(data?.id), error?.message ?? `prix ${data?.prix_xof}`);
}
{
  const { data } = await sb.from('ride_requests').select('id, prix_xof, depart_lat');
  verifier('le passager relit SA demande', data?.length === 1,
    data?.[0] ? `depart_lat exacte ${data[0].depart_lat}` : '');
}

// ------------------------------------------- confidentialité, à distance --
{
  const { data } = await sb.from('profiles').select('id, telephone, nom_complet');
  const autre = data?.some((p) => p.id === '22222222-2222-4222-8222-222222222222');
  verifier('ne voit que son propre profil', data?.length === 1 && !autre,
    `${data?.length ?? 0} ligne(s)`);
}
{
  const { data } = await sb.from('profiles').select('id').eq('telephone', '+221781112233');
  verifier('le numéro d’un tiers ne remonte pas', (data?.length ?? 0) === 0);
}
{
  const { data } = await sb.from('profils_publics').select('id, prenom').eq('id', '22222222-2222-4222-8222-222222222222');
  verifier('mais son prénom, oui (vue publique)', data?.[0]?.prenom === 'Modou', data?.[0]?.prenom ?? '');
}

// ------------------------------------------------ ce qui doit être fermé --
{
  const { error } = await sb.rpc('expire_stale');
  verifier('expire_stale REFUSÉE au client', Boolean(error), error?.code ?? error?.message ?? '');
}
{
  const { data, error } = await sb.from('demandes_ouvertes').select('id');
  verifier('file conducteur vide pour un non-conducteur', !error && data?.length === 0,
    error?.message ?? `${data?.length ?? 0} ligne(s)`);
}
{
  const { data, error } = await sb.rpc('commune_la_plus_proche', {
    p_lat: 14.7220, p_lon: -17.4900,
  });
  verifier('commune_la_plus_proche répond', data === 'Ouakam', error?.message ?? String(data));
}

console.log(resultats.join('\n'));
console.log(`\n${resultats.filter((r) => r.startsWith('✓')).length}/${resultats.length} vérifications passées`);
if (demandeId) console.log(`demande créée : ${demandeId}`);
