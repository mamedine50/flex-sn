-- Flex — les puces de la notation.
--
-- Sous les étoiles, quelques mots à cocher : « Ponctuel », « Conduite sûre ».
-- Elles servent une chose que l'étoile ne dit pas — POURQUOI. Trois étoiles sans
-- rien, personne n'en tire quoi que ce soit ; trois étoiles et « conduite sûre »
-- décoché, c'est une information exploitable.
--
-- ============================================ UNE LISTE, PAS UN CHAMP LIBRE
-- Le commentaire libre existe déjà et il est modéré : filtre à l'affichage,
-- signalement, blocage. Ajouter un second gisement de texte libre doublerait ce
-- travail. Une liste fermée se compte, se traduit, et ne s'insulte pas.
--
-- ============================================ POURQUOI UN TABLEAU, PAS DES COLONNES
-- Cinq colonnes booléennes auraient figé la liste dans le schéma : ajouter une
-- puce serait devenu une migration, et retirer une puce laisserait une colonne
-- morte. Un tableau de clés courtes se lit, se compte par `unnest`, et la liste
-- vit dans `src/i18n` où sont déjà tous les mots de l'interface.
--
-- LES CLÉS SONT VALIDÉES. Sans contrainte, le client écrirait n'importe quoi et
-- l'écran afficherait `⛔ clé` à la lecture. Le tableau des clés connues vit
-- donc ICI aussi — c'est le prix d'une liste ouverte côté interface.

create table public.puces_evaluation (
  cle text primary key,
  pour public.role_utilisateur not null
);

comment on table public.puces_evaluation is
  'Les puces cochables d''une évaluation. `pour` dit à QUI elles s''appliquent : on ne propose pas « voiture propre » à propos d''un passager.';

insert into public.puces_evaluation (cle, pour) values
  ('ponctuel', 'conducteur'),
  ('conduite_sure', 'conducteur'),
  ('sympa', 'conducteur'),
  ('voiture_propre', 'conducteur'),
  ('ponctuelle', 'passager'),
  ('respectueuse', 'passager'),
  ('bonne_communication', 'passager');

alter table public.puces_evaluation enable row level security;
revoke all on public.puces_evaluation from public, anon, authenticated;
grant select on public.puces_evaluation to authenticated;

-- La liste est publique : c'est un vocabulaire, pas une donnée personnelle.
create policy puces_lecture on public.puces_evaluation
  for select to authenticated using (true);

alter table public.evaluations
  add column puces text[] not null default '{}';

comment on column public.evaluations.puces is
  'Clés cochées, validées contre puces_evaluation par noter_course(). Facultatives : un tableau vide est une note sans commentaire, pas une note incomplète.';

-- ------------------------------------------------------------ noter_course --
-- ON RETIRE L'ANCIENNE SIGNATURE. Ajouter un paramètre à valeur par défaut crée
-- une SURCHARGE : les deux fonctions coexistent, et un appel à trois arguments
-- — tout client déjà publié — atterrit sur l'ancienne, qui n'enregistre aucune
-- puce et ne valide rien. Le défaut serait invisible : la note passe, les puces
-- disparaissent. Une fois l'ancienne retirée, l'appel à trois arguments retombe
-- sur la nouvelle par sa valeur par défaut, et les clients publiés continuent de
-- marcher.
drop function if exists public.noter_course(uuid, smallint, text);

-- Le corps est repris à l'identique : les puces s'ajoutent, rien ne se déplace.
-- Le double aveugle, le recalcul des moyennes et le refus de la double note
-- sont ceux d'avant.
create or replace function public.noter_course(
  p_course_id uuid,
  p_note smallint,
  p_commentaire text default null,
  p_puces text[] default '{}'
)
returns public.evaluations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_course public.rides;
  v_cible uuid;
  v_role public.role_utilisateur;
  v_eval public.evaluations;
  v_puces text[];
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select * into v_course from public.rides where id = p_course_id;

  if v_course.id is null then
    raise exception 'course_introuvable' using errcode = 'P0001';
  end if;

  if v_course.statut <> 'terminee' then
    raise exception 'course_non_terminee'
      using errcode = 'P0001', detail = 'On note une course une fois terminée.';
  end if;

  v_cible := case v_uid
    when v_course.passager_id then v_course.conducteur_id
    when v_course.conducteur_id then v_course.passager_id
    else null
  end;

  if v_cible is null then
    raise exception 'course_etrangere' using errcode = 'P0001';
  end if;

  -- La cible dicte les puces recevables : on ne dit pas d'un passager que sa
  -- voiture est propre.
  v_role := case when v_uid = v_course.passager_id
                 then 'conducteur'::public.role_utilisateur
                 else 'passager'::public.role_utilisateur end;

  -- Doublons écartés, ordre stable — deux évaluations identiques doivent se
  -- comparer sans dépendre de l'ordre de cochage.
  select coalesce(array_agg(distinct c order by c), '{}')
    into v_puces
  from unnest(coalesce(p_puces, '{}')) c;

  if exists (
    select 1 from unnest(v_puces) c
    where not exists (
      select 1 from public.puces_evaluation p
      where p.cle = c and p.pour = v_role
    )
  ) then
    raise exception 'puce_inconnue'
      using errcode = 'P0001',
            detail = 'Cette puce n''existe pas, ou ne s''applique pas à cette personne.';
  end if;

  insert into public.evaluations (course_id, auteur_id, cible_id, note, commentaire, puces)
  values (p_course_id, v_uid, v_cible, p_note, nullif(btrim(p_commentaire), ''), v_puces)
  on conflict (course_id, auteur_id) do nothing
  returning * into v_eval;

  if v_eval.course_id is null then
    raise exception 'deja_note' using errcode = 'P0001';
  end if;

  perform public.recalculer_notes(p_course_id);

  return v_eval;
end;
$$;

revoke all on function public.noter_course(uuid, smallint, text, text[])
  from public, anon, authenticated;
grant execute on function public.noter_course(uuid, smallint, text, text[])
  to authenticated;
