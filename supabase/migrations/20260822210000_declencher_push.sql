-- Flex — le déclencheur qui réveille les téléphones.
--
-- ================================== POURQUOI pg_net ET PAS UN APPEL DIRECT
-- Postgres ne parle pas HTTP. `pg_net` envoie la requête de façon ASYNCHRONE,
-- et c'est le seul mode acceptable ici : un appel synchrone ferait attendre la
-- transaction qui insère la notification. Autrement dit, `submit_offer()`
-- attendrait Expo pour rendre la main au conducteur. Un service tiers lent
-- ralentirait toute l'application ; un service tiers en panne l'arrêterait.
--
-- En asynchrone, l'échec d'un push ne casse rien : la notification est déjà en
-- base, l'application la montrera au prochain regard. LE PUSH EST UN BONUS, LA
-- TABLE EST LA VÉRITÉ.
--
-- ================================================== LES DEUX EN-TÊTES
-- `Authorization` porte la clé ANONYME. Elle ne donne aucun droit — elle
-- satisfait seulement le contrôle de jeton que Supabase place devant toute
-- fonction. Elle est publique et vit dans l'application de tout le monde.
--
-- `x-flex-secret` est la VRAIE autorisation, lue dans le coffre. Sans elle,
-- n'importe qui connaissant l'URL déclencherait des envois : la fonction
-- travaille en `service_role` et peut écrire à n'importe quel appareil.
-- `pg_net` NE SE LAISSE PAS INSTALLER dans le schéma qu'on lui demande : il
-- crée le sien, `net`, et `with schema` ne l'y déplace pas. Écrire
-- `extensions.net.http_post` fait lire à Postgres base.schéma.fonction, d'où
-- « cross-database references are not implemented ». On appelle donc `net`.
create extension if not exists pg_net;

create function public.declencher_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'push_secret';

  -- Pas de secret configuré : on ne pousse pas, et on ne casse rien. La
  -- notification est déjà en base — c'est elle qui fait foi.
  if v_secret is null then
    return new;
  end if;

  -- ── L'APPEL NE PEUT JAMAIS FAIRE TOMBER LA TRANSACTION ──
  -- Le déclencheur est APRÈS INSERT sur `notifications` : son échec ferait
  -- échouer la transaction entière. Plus aucune offre, plus aucune acceptation,
  -- plus aucun message ne passerait — pour un push manqué. Le commentaire disait
  -- déjà « le push est un bonus, la table est la vérité » ; le code ne le tenait
  -- pas. Maintenant si.
  begin
      perform net.http_post(
      url := 'https://gwnprkzzyfnryltdcpzk.supabase.co/functions/v1/push',
      headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-flex-secret', v_secret,
      'Authorization',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd3bnBya3p6eWZucnlsdGRjcHprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwOTE4ODIsImV4cCI6MjEwMjY2Nzg4Mn0.BDH0O3DYul_ReAkcpPY3nB1knHtlSZtNrhIYcVNKU0M'
    ),
      body := jsonb_build_object('id', new.id),
      timeout_milliseconds := 3000
    );
  exception
    when others then
      -- Un téléphone qui ne sonne pas est un désagrément ; une offre qui
      -- n'existe pas est une course perdue.
      null;
  end;

  return new;
end;
$$;

revoke all on function public.declencher_push() from public, anon, authenticated;

create trigger notifications_poussent
after insert on public.notifications
for each row execute function public.declencher_push();

comment on function public.declencher_push() is
  'Réveille les téléphones du destinataire, en ASYNCHRONE : un service tiers lent ne doit pas ralentir la transaction qui a créé la notification. Le push est un bonus, la table est la vérité.';
