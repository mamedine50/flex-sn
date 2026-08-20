// Aller-retour réel : la recommandation, le journal, et son invisibilité.
//
//   pnpm db:start && node scripts/verif-recommandation.mjs
//
// LOCAL uniquement, avec un compte éphémère créé par l'API admin et effacé en
// fin de course. Il tournait auparavant sur le distant avec `dev@flex.test` —
// un compte à mot de passe versionné, supprimé depuis.
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(dirname(fileURLToPath(import.meta.url)));
const sortie = execFileSync('supabase', ['status', '-o', 'env'], {
  encoding: 'utf8',
  cwd: racine,
});
const lire = (cle) => sortie.match(new RegExp(`^${cle}="?([^"\\n]+)"?$`, 'm'))?.[1];
const url = lire('API_URL');
const anon = lire('ANON_KEY');
const service = lire('SERVICE_ROLE_KEY');

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(url ?? '')) {
  console.log('Refus : ce script ne sort jamais de la pile locale.');
  process.exit(1);
}

const admin = createClient(url, service, { auth: { persistSession: false } });
const email = `verif-reco-${Date.now()}@flex.test`;
const { data: cree } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { prenom: 'Awa' },
});
const { data: lien } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

const sb = createClient(url, anon, { auth: { persistSession: false } });
await sb.auth.verifyOtp({ token_hash: lien.properties.hashed_token, type: 'email' });

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

await admin.auth.admin.deleteUser(cree.user.id);
