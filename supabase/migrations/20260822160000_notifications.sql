-- Flex — les notifications DANS l'application.
--
-- ============================================== POURQUOI UNE TABLE
-- On aurait pu se contenter d'écouter Realtime et d'afficher un bandeau. C'est
-- exactement ce que le dépôt interdit ailleurs, et pour la même raison : le
-- canal se ferme quand l'application passe en arrière-plan, et les événements
-- de l'intervalle ne sont JAMAIS rejoués. Un passager qui verrouille son
-- téléphone pendant qu'un conducteur baisse son prix ne l'apprendrait jamais.
--
-- Une table survit à l'arrière-plan. C'est toute la différence entre un signal
-- et une notification.
--
-- ================================ ELLE NE PORTE JAMAIS DE PHRASE
-- `genre` + des identifiants + un montant. Jamais « Ousmane propose 2 500 FCFA ».
-- Trois raisons, et chacune suffirait :
--
--   1. L'INTERFACE EST EN TROIS LANGUES. Une phrase écrite en base est figée
--      dans celle de l'écriture. Le français d'un serveur ne se traduit pas.
--   2. LA CONFIDENTIALITÉ EST UNE PROJECTION, pas une copie. Un prénom recopié
--      dans une notification sort du champ des vues publiques et y reste, même
--      si la règle change. Le client va chercher le nom là où la RLS le sert.
--   3. UN MONTANT SE FORMATE CÔTÉ CLIENT — espace insécable, FCFA suffixé,
--      chiffres tabulaires. Une phrase pré-écrite perd tout ça.
--
-- ============================ UNE NOTIFICATION EST UN POINTEUR, PAS UN FAIT
-- Elle dit « il s'est passé quelque chose ICI ». En l'ouvrant, l'écran RELIT
-- l'état courant. Si l'offre a expiré entre-temps, on voit la vérité et non le
-- souvenir. Même règle que pour Realtime : ça déclenche, ça ne fait pas foi.
create type public.genre_notification as enum (
  'offre_recue',
  'contre_offre',
  'offre_acceptee',
  'course_annulee',
  'message',
  'document_decide',
  'demande_expiree',
  -- La course est partie avec quelqu'un d'autre. Sans ça, un conducteur qui a
  -- proposé un prix reste devant un écran qui n'a rien à lui dire : son offre
  -- disparaît de la file, et il ne sait pas si elle a été refusée, si elle a
  -- expiré, ou s'il n'a jamais été vu. Le silence se lit comme un échec
  -- personnel — et ce n'en est pas un.
  'offre_caduque'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  destinataire_id uuid not null references public.profiles (id) on delete cascade,
  genre public.genre_notification not null,
  -- Où pointer. Trois clés parce que trois écrans : les offres d'une demande,
  -- une course, un dossier. Toujours au moins une, jamais toutes.
  demande_id uuid references public.ride_requests (id) on delete cascade,
  course_id uuid references public.rides (id) on delete cascade,
  -- Le montant en jeu, quand il y en a un. Entier XOF, comme partout.
  montant_xof integer check (montant_xof is null or montant_xof > 0),
  -- Qui a agi. Le client résout le prénom par les vues publiques ; on ne le
  -- recopie pas ici.
  acteur_id uuid references public.profiles (id) on delete set null,
  lu_le timestamptz,
  -- `clock_timestamp()` et non `now()`. `now()` rend l'heure de la TRANSACTION :
  -- une acceptation dépose sa notification pour le passager, une pour le
  -- conducteur et une par conducteur évincé — toutes à la milliseconde près
  -- identiques, donc dans un ordre arbitraire à l'affichage. Une boîte de
  -- notifications est une chronologie ; elle a besoin d'un temps qui avance.
  cree_le timestamptz not null default clock_timestamp(),
  constraint notification_pointe_quelque_part
    check (demande_id is not null or course_id is not null or genre = 'document_decide')
);

comment on table public.notifications is
  'Ce qui s''est passé pendant qu''on ne regardait pas. Genre + identifiants, JAMAIS une phrase : l''interface est en trois langues, un prénom recopié sort du champ des vues publiques, et un montant se formate côté client.';

create index notifications_boite on public.notifications (destinataire_id, cree_le desc);
-- La pastille compte les non-lues : un index partiel, parce que c'est la seule
-- requête qui tourne à chaque ouverture d'écran.
create index notifications_non_lues on public.notifications (destinataire_id)
  where lu_le is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

create policy notifications_les_miennes on public.notifications
  for select to authenticated
  using (destinataire_id = (select auth.uid()));

-- ------------------------------------------------------------- déposer --
-- Utilitaire interne des déclencheurs. Personne ne l'appelle : une notification
-- qu'on peut fabriquer soi-même est une notification qui ment.
create function public.deposer_notification(
  p_destinataire uuid,
  p_genre public.genre_notification,
  p_demande uuid default null,
  p_course uuid default null,
  p_montant integer default null,
  p_acteur uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- On ne se notifie pas soi-même : celui qui agit sait ce qu'il vient de faire.
  if p_destinataire is null or p_destinataire = p_acteur then
    return;
  end if;

  insert into public.notifications
    (destinataire_id, genre, demande_id, course_id, montant_xof, acteur_id)
  values (p_destinataire, p_genre, p_demande, p_course, p_montant, p_acteur);
end;
$$;

revoke all on function public.deposer_notification(
  uuid, public.genre_notification, uuid, uuid, integer, uuid)
  from public, anon, authenticated;

-- ================================================== LES DÉCLENCHEURS
-- Sur les TABLES, pas dans les RPC. Une offre entre par `submit_offer` ou par
-- `contre_proposer` ; un déclencheur les couvre toutes les deux, et couvrira la
-- prochaine sans qu'on y pense. C'est exactement le défaut qu'on a déjà payé
-- une fois avec le compte de pièces figé à quatre.

-- ---------------------------------------------------- une offre arrive --
create function public.notifier_offre()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passager uuid;
begin
  select d.passager_id into v_passager
  from public.ride_requests d where d.id = new.demande_id;

  if new.auteur = 'conducteur' then
    -- C'est le passager qui apprend quelque chose.
    perform public.deposer_notification(
      v_passager,
      case when new.tour <= 1 then 'offre_recue' else 'contre_offre' end::public.genre_notification,
      new.demande_id, null, new.prix_xof, new.conducteur_id);
  else
    -- Le passager a répondu : c'est le conducteur du fil qui apprend.
    perform public.deposer_notification(
      new.conducteur_id, 'contre_offre',
      new.demande_id, null, new.prix_xof, v_passager);
  end if;

  return new;
end;
$$;

revoke all on function public.notifier_offre() from public, anon, authenticated;

create trigger offres_notifient
after insert on public.offers
for each row execute function public.notifier_offre();

-- ------------------------------------------------- la course se verrouille --
create function public.notifier_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acteur uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    -- Celui qui n'a pas appuyé apprend que c'est conclu. `deposer_notification`
    -- écarte l'acteur tout seul, donc on notifie les deux sans distinguer.
    perform public.deposer_notification(
      new.passager_id, 'offre_acceptee', new.demande_id, new.id,
      new.prix_convenu_xof, v_acteur);
    perform public.deposer_notification(
      new.conducteur_id, 'offre_acceptee', new.demande_id, new.id,
      new.prix_convenu_xof, v_acteur);

    -- ── LES AUTRES CONDUCTEURS APPRENNENT QUE C'EST PRIS ──
    -- Ils ont proposé un prix sur cette demande et ne l'ont pas eue. Leur offre
    -- devient caduque toute seule ; personne ne le leur disait. `distinct` :
    -- une négociation à quatre tours laisse plusieurs offres du MÊME
    -- conducteur, et on ne prévient pas quelqu'un quatre fois.
    --
    -- On ne passe PAS le montant convenu : le prix auquel un autre a été pris
    -- ne le regarde pas. Il saurait ce que son concurrent a accepté, et ça
    -- tirerait tous les prix dans le même sens.
    perform public.deposer_notification(
      c.conducteur_id, 'offre_caduque', new.demande_id, null, null, null)
    from (
      select distinct o.conducteur_id
      from public.offers o
      where o.demande_id = new.demande_id
        and o.conducteur_id <> new.conducteur_id
    ) c;

    return new;
  end if;

  if new.statut = 'annulee' and old.statut <> 'annulee' then
    perform public.deposer_notification(
      new.passager_id, 'course_annulee', new.demande_id, new.id,
      null, new.annulee_par);
    perform public.deposer_notification(
      new.conducteur_id, 'course_annulee', new.demande_id, new.id,
      null, new.annulee_par);
  end if;

  return new;
end;
$$;

revoke all on function public.notifier_course() from public, anon, authenticated;

create trigger courses_notifient
after insert or update on public.rides
for each row execute function public.notifier_course();

-- ------------------------------------------------------ un message arrive --
create function public.notifier_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course public.rides;
begin
  select * into v_course from public.rides r where r.id = new.course_id;

  perform public.deposer_notification(
    case when new.expediteur_id = v_course.passager_id
         then v_course.conducteur_id else v_course.passager_id end,
    'message', v_course.demande_id, v_course.id, null, new.expediteur_id);

  return new;
end;
$$;

revoke all on function public.notifier_message() from public, anon, authenticated;

create trigger messages_notifient
after insert on public.messages
for each row execute function public.notifier_message();

-- --------------------------------------------------- une pièce est tranchée --
create function public.notifier_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.statut <> old.statut and new.statut in ('valide', 'refuse') then
    -- L'acteur est l'admin : on ne le passe PAS, sinon un admin qui tranche son
    -- propre dossier ne serait pas prévenu, et surtout son identité n'a rien à
    -- faire dans la boîte de quelqu'un d'autre.
    perform public.deposer_notification(
      new.profil_id, 'document_decide', null, null, null, null);
  end if;
  return new;
end;
$$;

revoke all on function public.notifier_document() from public, anon, authenticated;

create trigger documents_notifient
after update on public.documents_conducteur
for each row execute function public.notifier_document();

-- ------------------------------------------------- la demande s'est éteinte --
-- Le silence est une information. Une demande qui expire sans qu'aucun
-- conducteur ait répondu, personne ne l'apprend — et le passager reste à
-- regarder un écran qui n'attend plus rien.
create function public.notifier_expiration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.statut = 'expiree' and old.statut = 'ouverte' then
    perform public.deposer_notification(
      new.passager_id, 'demande_expiree', new.id, null, new.prix_xof, null);
  end if;
  return new;
end;
$$;

revoke all on function public.notifier_expiration() from public, anon, authenticated;

create trigger demandes_notifient
after update on public.ride_requests
for each row execute function public.notifier_expiration();

-- ------------------------------------------------------------- marquer lu --
-- Sans identifiant : on marque TOUT ce qui est à soi. Marquer une par une
-- ferait autant d'allers-retours que de lignes, sur une 3G où chacun se paie —
-- et l'écran de la boîte se lit d'un coup d'œil, pas ligne par ligne.
create function public.marquer_notifications_lues()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n integer;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  with marquees as (
    update public.notifications
    set lu_le = now()
    where destinataire_id = v_uid and lu_le is null
    returning 1
  )
  select count(*)::integer into v_n from marquees;

  return v_n;
end;
$$;

revoke all on function public.marquer_notifications_lues() from public, anon, authenticated;
grant execute on function public.marquer_notifications_lues() to authenticated;

comment on function public.marquer_notifications_lues() is
  'Marque toutes SES notifications comme lues. Sans identifiant : elle n''agit que sur auth.uid().';

alter publication supabase_realtime add table public.notifications;
