// Aller-retour réel : la recommandation, le journal, et son invisibilité.
//
//   node scripts/verif-recommandation.mjs
//
// Demande le compte dev@flex.test sur le distant. Il CRÉE une demande de course
// et supprime celles du compte de dev — ne pas le lancer sur une base qui porte
// de vraies données.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
await sb.auth.signInWithPassword({ email: 'dev@flex.test', password: 'flex-dev-2026' });

const r = [];
const v = (nom, ok, detail = '') => r.push(`${ok ? '✓' : '✗'} ${nom.padEnd(56)}${detail}`);

const { data: urbain } = await sb.rpc('prix_suggere', {
  p_service: 'urbain', p_depart_lat: 14.6690, p_depart_lon: -17.4380,
  p_destination_lat: 14.7480, p_destination_lon: -17.5130,
});
v('recommandation urbaine Plateau → Ngor', urbain >= 2000 && urbain <= 3000, `${urbain} F`);

const { data: inter } = await sb.rpc('prix_suggere', {
  p_service: 'interurbain', p_depart_lat: 14.6690, p_depart_lon: -17.4380,
  p_destination_lat: 14.8500, p_destination_lon: -15.8800,
});
v('interurbain : aucune recommandation', inter === null, String(inter));

await sb.from('ride_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
const { data: demande, error } = await sb.rpc('create_ride_request', {
  p_service: 'urbain', p_depart_lat: 14.6690, p_depart_lon: -17.4380,
  p_depart_libelle: 'Plateau', p_destination_lat: 14.7480, p_destination_lon: -17.5130,
  p_destination_libelle: 'Ngor', p_prix_xof: 3000, p_recommandation_xof: urbain,
});
v('create_ride_request avec recommandation', Boolean(demande?.id), error?.message ?? '');

const { error: lecture } = await sb.from('events_prix').select('*');
v('le client ne lit pas events_prix', Boolean(lecture), lecture?.code ?? '');

const { error: stats } = await sb.from('stats_routes').select('*');
v('ni stats_routes', Boolean(stats), stats?.code ?? '');

console.log(r.join('\n'));
console.log(`\n${r.filter((x) => x.startsWith('✓')).length}/${r.length} vérifications passées`);
