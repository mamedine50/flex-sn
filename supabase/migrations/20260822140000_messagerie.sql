-- Flex — la messagerie interne, pour que les numéros restent privés.
--
-- ================================================== POURQUOI ELLE EXISTE
-- « Écrire » ouvrait l'application SMS du téléphone. Ça marche, et ça expose
-- les deux numéros — définitivement. Un conducteur qui a le numéro d'une
-- passagère l'a POUR TOUJOURS : la course finit, la RLS se referme, mais le
-- numéro est déjà dans son téléphone. Aucune règle serveur ne rattrape ça.
--
-- Le fil interne le ferme : on discute sans jamais échanger de numéro, et la
-- conversation meurt avec la course.
--
-- ============================================ EN AJOUT SEUL, POUR TOUT LE MONDE
-- Aucun `update`, aucun `delete`, pour personne. Un message qu'on peut
-- retirer est un message qu'on peut faire disparaître — et l'historique d'un
-- fil est exactement ce qu'un signalement produit comme preuve. Même raison que
-- pour `signalements`.
--
-- ================================== LE FIL S'OUVRE ET SE FERME AVEC LA COURSE
-- Il n'existe pas avant l'acceptation : avant, les deux ne se connaissent pas,
-- et un canal ouvert entre inconnus est un canal de démarchage.
--
-- Il se ferme à « terminée ». LECTURE ENCORE POSSIBLE, ÉCRITURE NON — c'est la
-- dissymétrie qui compte. Lire, parce qu'un signalement se fait après coup et
-- qu'il lui faut ses preuves. Écrire, non : un fil qui reste ouvert après le
-- trajet est un canal de harcèlement qu'on a soi-même installé.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.rides (id) on delete cascade,
  expediteur_id uuid not null references public.profiles (id) on delete cascade,
  -- Mille caractères. Assez pour une adresse et un repère, trop peu pour qu'un
  -- fil de course devienne autre chose qu'un fil de course.
  contenu text not null check (length(btrim(contenu)) between 1 and 1000),
  cree_le timestamptz not null default now()
);

comment on table public.messages is
  'Le fil d''une course. En ajout seul. Ouvert de la course verrouillée à sa fin ; lisible après, jamais réécrivable. Remplace les SMS de l''opérateur, qui exposaient les deux numéros pour toujours.';
comment on column public.messages.contenu is
  'Texte libre, 1 à 1000 caractères. Filtré à l''AFFICHAGE par masquerGrossieretes() — on ne réécrit pas ce que quelqu''un a envoyé, on choisit ce qu''on en montre.';

-- La lecture d'un fil se fait par (course_id, cree_le) et rien d'autre.
create index messages_fil on public.messages (course_id, cree_le);

alter table public.messages enable row level security;
revoke all on public.messages from public, anon, authenticated;
-- SELECT seul. Pas d'insert de table : l'envoi passe par `envoyer_message()`,
-- qui est le seul endroit où la règle de fermeture peut être tenue. Un `grant
-- insert` ici contournerait la fonction — c'est la règle du dépôt.
grant select on public.messages to authenticated;

-- ------------------------------------------------------------- lire le fil --
-- Les DEUX participants de CETTE course, et personne d'autre. Pas de condition
-- de statut : après la course, l'historique reste lisible pour un signalement.
create policy messages_participants on public.messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.rides r
      where r.id = public.messages.course_id
        and (select auth.uid()) in (r.passager_id, r.conducteur_id)
    )
  );

-- ----------------------------------------------------------------- envoyer --
create function public.envoyer_message(
  p_course_id uuid,
  p_contenu text
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_course public.rides;
  v_texte text := btrim(coalesce(p_contenu, ''));
  v_message public.messages;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if v_texte = '' then
    raise exception 'message_vide' using errcode = 'P0001';
  end if;

  if length(v_texte) > 1000 then
    raise exception 'message_trop_long' using errcode = 'P0001';
  end if;

  select * into v_course from public.rides r where r.id = p_course_id;

  if v_course.id is null then
    raise exception 'course_introuvable' using errcode = 'P0001';
  end if;

  -- Un tiers n'écrit pas dans le fil de deux autres. Le test le prouve, parce
  -- que « la policy de lecture le protège » ne protège pas l'ÉCRITURE : cette
  -- fonction est SECURITY DEFINER et traverse la RLS.
  if v_uid not in (v_course.passager_id, v_course.conducteur_id) then
    raise exception 'pas_votre_course'
      using errcode = 'P0001',
            detail = 'Seuls le passager et le conducteur de cette course écrivent dans son fil.';
  end if;

  -- La fermeture. « terminee » et « annulee » ferment l'envoi ; la lecture,
  -- elle, reste ouverte par la policy.
  if not public.course_active(v_course.statut) then
    raise exception 'fil_ferme'
      using errcode = 'P0001',
            detail = 'La conversation se ferme à la fin de la course.';
  end if;

  insert into public.messages (course_id, expediteur_id, contenu)
  values (p_course_id, v_uid, v_texte)
  returning * into v_message;

  return v_message;
end;
$$;

revoke all on function public.envoyer_message(uuid, text) from public, anon, authenticated;
grant execute on function public.envoyer_message(uuid, text) to authenticated;

comment on function public.envoyer_message(uuid, text) is
  'Écrit dans le fil d''une course. Refuse un tiers, refuse un fil fermé. Seul chemin d''écriture : la table n''accorde que SELECT.';

-- ------------------------------------------------------------- temps réel --
-- Le fil DOIT arriver sans rafraîchir : une messagerie qu'on doit recharger
-- n'est pas une messagerie. Realtime respecte la RLS pour `authenticated`, donc
-- la policy de lecture ci-dessus est aussi le filtre du canal.
--
-- L'ÉVÉNEMENT DÉCLENCHE, IL NE FAIT PAS FOI — règle du dépôt. L'écran relit le
-- fil à réception plutôt que d'empiler la charge utile : le canal se ferme
-- quand l'application passe en arrière-plan, et les événements de l'intervalle
-- ne sont jamais rejoués.
alter publication supabase_realtime add table public.messages;
