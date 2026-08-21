-- Flex — signaler un comportement ou un avis.
--
-- Exigence de l'App Store (règle 1.2) pour toute application portant du contenu
-- écrit par ses utilisateurs — et une évaluation porte un commentaire libre de
-- 500 caractères. Apple en demande quatre : filtrer le contenu grossier,
-- permettre de SIGNALER, permettre de BLOQUER, publier un contact. Le blocage
-- existe depuis `20260821100000_blocages`, le contact est sur la page de
-- support, le filtre vit côté affichage. Il manquait celui-ci.
--
-- LE MOTIF EST UNE LISTE, PAS UN CHAMP LIBRE. Un champ libre serait un second
-- gisement de contenu utilisateur — à modérer à son tour, et lisible par
-- l'équipe. Une liste courte suffit à trier une file d'attente, et c'est tout ce
-- qu'on lui demande.
--
-- EN AJOUT SEUL. Aucun `update`, aucun `delete`, pour personne. Un signalement
-- qu'on peut retirer est un signalement qu'on peut faire disparaître.

create type public.motif_signalement as enum (
  'insulte',
  'conduite_dangereuse',
  'fraude',
  'harcelement',
  'autre'
);

create table public.signalements (
  id uuid primary key default gen_random_uuid(),
  auteur uuid not null references public.profiles (id) on delete cascade,
  cible uuid not null references public.profiles (id) on delete cascade,
  motif public.motif_signalement not null,
  course_id uuid not null references public.rides (id),
  -- `evaluations` a une clé composite (course_id, auteur_id) et pas d'identifiant
  -- propre. Un avis reçu est donc DÉJÀ désigné par la course et la contrepartie,
  -- que la ligne porte toutes deux : un drapeau suffit à dire si le signalement
  -- vise l'avis ou le comportement.
  porte_sur_avis boolean not null default false,
  cree_le timestamptz not null default now(),
  constraint signalement_pas_soi_meme check (auteur <> cible)
);

create index signalements_cible on public.signalements (cible, cree_le desc);
create index signalements_a_traiter on public.signalements (cree_le desc);

alter table public.signalements enable row level security;

-- Aucune policy, et c'est le verrou : ni `anon` ni `authenticated` ne lit ni
-- n'écrit cette table directement. On passe par la fonction, ou par rien.
revoke all on public.signalements from public, anon, authenticated;

-- ---------------------------------------------------------------- signaler --
-- LE CLIENT NE NOMME PAS LA CIBLE, il nomme la COURSE. Deux raisons, et la
-- seconde est la vraie :
--
-- 1. Passer un identifiant de profil laisserait signaler n'importe qui, et la
--    fonction n'aurait plus qu'à refuser — un refus est un renseignement.
-- 2. Surtout : `mes_evaluations` ne porte PAS l'auteur de l'avis, exprès. Le
--    double aveugle tombe si l'écran doit connaître la personne pour la
--    signaler. Le serveur, lui, sait déjà qui est l'autre bout de la course.
create function public.signaler(
  p_course_id uuid,
  p_motif public.motif_signalement,
  p_porte_sur_avis boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_cible uuid;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  -- La course doit être LA VÔTRE. L'autre bout s'en déduit.
  select case when r.passager_id = v_uid then r.conducteur_id else r.passager_id end
    into v_cible
  from public.rides r
  where r.id = p_course_id
    and (r.passager_id = v_uid or r.conducteur_id = v_uid);

  if v_cible is null then
    raise exception 'course_pas_la_votre' using errcode = 'P0001';
  end if;

  -- Un avis ne se signale que s'il vous VISE : signaler celui d'un tiers
  -- reviendrait à modérer une conversation qui ne vous regarde pas.
  if p_porte_sur_avis and not exists (
    select 1 from public.evaluations e
    where e.course_id = p_course_id
      and e.auteur_id = v_cible
      and e.cible_id = v_uid
  ) then
    raise exception 'aucun_avis_a_signaler' using errcode = 'P0001';
  end if;

  insert into public.signalements (auteur, cible, motif, course_id, porte_sur_avis)
  values (v_uid, v_cible, p_motif, p_course_id, p_porte_sur_avis);
end;
$$;

revoke all on function public.signaler(uuid, public.motif_signalement, boolean)
  from public, anon, authenticated;
grant execute on function public.signaler(uuid, public.motif_signalement, boolean)
  to authenticated;

-- ------------------------------------------------------- la file de l'équipe --
-- Même forme que `dossiers_en_attente` : le filtre `est_admin()` vit DANS la
-- définition de la vue, pas dans la requête du client. Il ne peut donc pas être
-- oublié à l'appel.
create view public.signalements_recus
with (security_invoker = false) as
  select
    s.id,
    s.motif,
    s.cree_le,
    s.course_id,
    s.porte_sur_avis,
    s.cible,
    c.prenom as cible_prenom,
    (select count(*) from public.signalements a where a.cible = s.cible) as total_sur_la_cible
  from public.signalements s
  join public.profiles c on c.id = s.cible
  where public.est_admin()
  order by s.cree_le desc;

revoke all on public.signalements_recus from public, anon, authenticated;
grant select on public.signalements_recus to authenticated;

comment on view public.signalements_recus is
  'File de modération. Ne rend rien à qui n''est pas admin — le filtre est dans la vue. L''AUTEUR du signalement n''est pas projeté : le traiter ne demande pas de savoir qui a parlé, et le savoir invite à la représaille.';
