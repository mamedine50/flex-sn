/**
 * Flex — l'envoi des notifications push.
 *
 * ── POURQUOI LA PHRASE S'ÉCRIT ICI ─────────────────────────────────────────
 * La table `notifications` ne porte JAMAIS de texte : trois langues, et un
 * prénom recopié sortirait du champ des vues publiques. Mais un push doit
 * afficher quelque chose sur un écran verrouillé — l'application ne tourne pas,
 * elle ne peut rien composer.
 *
 * La phrase est donc écrite ICI, au moment de l'envoi, dans la langue du
 * DESTINATAIRE, et elle n'est stockée nulle part. C'est le seul endroit du
 * produit où un dictionnaire est dupliqué, et c'est assumé : l'alternative
 * serait de figer une phrase en base, ce qui coûterait beaucoup plus cher.
 *
 * On garde donc ce dictionnaire MINIMAL — seulement les genres qui méritent de
 * réveiller un téléphone.
 *
 * ── CE QUI NE RÉVEILLE PAS UN TÉLÉPHONE ────────────────────────────────────
 * `offre_caduque` n'envoie rien. C'est une mauvaise nouvelle sur laquelle le
 * conducteur ne peut rien : sa file lui montrera d'autres courses de toute
 * façon. Un push qui dit « vous avez perdu » ne sert qu'à faire désinstaller.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO = 'https://exp.host/--/api/v2/push/send';

type Genre =
  | 'offre_recue'
  | 'contre_offre'
  | 'offre_acceptee'
  | 'course_annulee'
  | 'message'
  | 'document_decide'
  | 'demande_expiree'
  | 'conducteur_arrive'
  | 'offre_caduque';

/** Les genres qui réveillent. `offre_caduque` n'y est pas, délibérément. */
const REVEILLENT: Genre[] = [
  'offre_recue',
  'contre_offre',
  'offre_acceptee',
  'conducteur_arrive',
  'message',
  'course_annulee',
  'demande_expiree',
  'document_decide',
];

const PHRASES: Record<'fr' | 'en', Record<string, string>> = {
  fr: {
    offre_recue: '{prenom} propose {montant}',
    contre_offre: '{prenom} propose maintenant {montant}',
    offre_acceptee: 'Course confirmée avec {prenom} à {montant}',
    conducteur_arrive: '{prenom} est arrivé',
    course_annulee: 'Course annulée',
    message: '{prenom} vous a écrit',
    document_decide: 'Votre dossier conducteur a été examiné',
    demande_expiree: 'Votre demande a expiré sans réponse',
  },
  en: {
    offre_recue: '{prenom} offers {montant}',
    contre_offre: '{prenom} now offers {montant}',
    offre_acceptee: 'Ride confirmed with {prenom} at {montant}',
    conducteur_arrive: '{prenom} has arrived',
    course_annulee: 'Ride cancelled',
    message: '{prenom} wrote to you',
    document_decide: 'Your driver file has been reviewed',
    demande_expiree: 'Your request expired with no reply',
  },
};

const QUELQUUN = { fr: 'Quelqu’un', en: 'Someone' };

/**
 * Le montant, formaté comme partout ailleurs : espace INSÉCABLE entre les
 * milliers, FCFA suffixé après une espace. Jamais « 2,500 ».
 */
function formatXof(montant: number): string {
  const milliers = String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${milliers} FCFA`;
}

Deno.serve(async (requete) => {
  // Le secret partagé. Sans lui, n'importe qui pourrait déclencher un envoi
  // vers n'importe quel jeton — la fonction tourne en `service_role`.
  const attendu = Deno.env.get('PUSH_SECRET');
  if (!attendu || requete.headers.get('x-flex-secret') !== attendu) {
    return new Response('non autorisé', { status: 401 });
  }

  const { id } = await requete.json().catch(() => ({ id: null }));
  if (!id) return new Response('id manquant', { status: 400 });

  const base = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data: notification } = await base
    .from('notifications')
    .select('id, genre, destinataire_id, acteur_id, montant_xof, demande_id, course_id')
    .eq('id', id)
    .single();

  if (!notification) return new Response('introuvable', { status: 404 });
  if (!REVEILLENT.includes(notification.genre as Genre)) {
    return new Response(JSON.stringify({ envoye: 0, raison: 'genre silencieux' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const { data: jetons } = await base
    .from('jetons_push')
    .select('jeton')
    .eq('profil_id', notification.destinataire_id);

  if (!jetons || jetons.length === 0) {
    return new Response(JSON.stringify({ envoye: 0, raison: 'aucun appareil' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // La langue du DESTINATAIRE, pas celle du serveur.
  const { data: profil } = await base
    .from('profiles')
    .select('langue')
    .eq('id', notification.destinataire_id)
    .single();

  const langue = profil?.langue === 'en' ? 'en' : 'fr';

  // Le prénom vient de la projection publique, jamais de `profiles` : c'est la
  // même règle qu'à l'écran, et elle vaut aussi quand c'est le serveur qui lit.
  let prenom = QUELQUUN[langue];
  if (notification.acteur_id) {
    const { data: acteur } = await base
      .from('profils_publics')
      .select('prenom')
      .eq('id', notification.acteur_id)
      .single();
    if (acteur?.prenom) prenom = acteur.prenom;
  }

  const corps = (PHRASES[langue][notification.genre] ?? '')
    .replace('{prenom}', prenom)
    .replace(
      '{montant}',
      notification.montant_xof ? formatXof(notification.montant_xof) : '',
    );

  const messages = jetons.map((j) => ({
    to: j.jeton,
    title: 'Flex',
    body: corps,
    sound: 'default',
    // De quoi ouvrir le BON écran. Le contenu reste un pointeur : l'écran
    // relira l'état courant, il ne fera pas confiance à ce qu'on lui passe.
    data: {
      genre: notification.genre,
      demande_id: notification.demande_id,
      course_id: notification.course_id,
    },
  }));

  const reponse = await fetch(EXPO, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(messages),
  });

  const resultat = await reponse.json().catch(() => null);

  // ── LES JETONS MORTS S'EFFACENT ──
  // Expo répond `DeviceNotRegistered` quand l'application a été désinstallée.
  // Un jeton mort qu'on garde, c'est un envoi pour rien à chaque notification
  // et une table qui grossit sans que personne ne la regarde.
  const morts: string[] = [];
  const tickets = resultat?.data;
  if (Array.isArray(tickets)) {
    tickets.forEach((ticket, i) => {
      if (ticket?.details?.error === 'DeviceNotRegistered') {
        const jeton = jetons[i]?.jeton;
        if (jeton) morts.push(jeton);
      }
    });
  }
  if (morts.length > 0) {
    await base.from('jetons_push').delete().in('jeton', morts);
  }

  return new Response(
    JSON.stringify({ envoye: messages.length - morts.length, effaces: morts.length }),
    { headers: { 'content-type': 'application/json' } },
  );
});
