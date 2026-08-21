-- Flex — valider un dossier conducteur depuis l'application.
--
-- Le back-office web viendra ; en attendant, le fondateur valide depuis son
-- téléphone. Ce qui suit ouvre ce droit à un profil MARQUÉ admin, et à personne
-- d'autre.

-- ------------------------------------------------------------- le drapeau --
-- Posé UNIQUEMENT par `service_role`, à la main, en SQL. Aucune RPC ne permet
-- de se l'attribuer : une fonction qui accorde l'administration est une
-- fonction qu'on finira par appeler par erreur.
alter table public.profiles add column est_admin boolean not null default false;

comment on column public.profiles.est_admin is
  'Droit de valider les dossiers conducteur. Posé à la main par service_role — AUCUNE RPC ne doit permettre de se l''attribuer, ni de l''attribuer à autrui.';

/**
 * L'appelant est-il administrateur ?
 *
 * `security definer` : la policy de `profiles` ne sert la ligne d'autrui à
 * personne, et cette fonction doit pouvoir lire la sienne quel que soit le
 * contexte d'appel — y compris depuis une vue.
 */
create function public.est_admin(p_profil uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.est_admin
     from public.profiles p
     where p.id = coalesce(p_profil, (select auth.uid()))),
    false
  );
$$;

revoke all on function public.est_admin(uuid) from public, anon;
grant execute on function public.est_admin(uuid) to authenticated;

-- ------------------------------------------------------------- le journal --
-- En ajout seul. Le jour où un conducteur conteste un refus, on doit pouvoir
-- dire qui a décidé quoi, quand, et pourquoi.
create table public.decisions_documents (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references public.profiles (id) on delete cascade,
  type public.type_document not null,
  decide_par uuid not null references public.profiles (id),
  valide boolean not null,
  motif text check (length(btrim(motif)) between 3 and 300),
  decide_le timestamptz not null default now(),

  -- Un refus SANS motif ne se conteste pas, et ne se corrige pas non plus.
  constraint decisions_motif_si_refus check (valide or motif is not null)
);

create index decisions_documents_profil on public.decisions_documents (profil_id, decide_le desc);

comment on table public.decisions_documents is
  'Journal des décisions sur les dossiers conducteur. AJOUT SEUL : on n''efface pas une décision, on en prend une nouvelle.';

alter table public.decisions_documents enable row level security;
revoke all on public.decisions_documents from anon, authenticated;
grant select on public.decisions_documents to authenticated;

-- Chacun voit les décisions qui LE concernent. L'admin voit tout : c'est son
-- travail, et c'est ce qui lui permet de répondre à une contestation.
create policy decisions_les_siennes on public.decisions_documents
  for select to authenticated
  using (profil_id = (select auth.uid()) or public.est_admin());

-- ------------------------------------------------- la file de l'admin --
-- Les dossiers qui attendent, du plus ancien au plus récent. Le délai d'attente
-- est calculé ici : c'est lui qui met la pression dans le bon sens.
create view public.dossiers_en_attente
with (security_invoker = false) as
select
  p.id as profil_id,
  p.prenom,
  p.nom_complet,
  p.telephone,
  p.photo_url,
  count(*) filter (where d.statut = 'en_attente') as pieces_en_attente,
  count(*) filter (where d.statut = 'valide') as pieces_validees,
  count(*) filter (where d.statut = 'refuse') as pieces_refusees,
  min(d.cree_le) as depuis,
  (select v.plaque from public.vehicles v where v.conducteur_id = p.id and v.actif) as plaque,
  (select v.modele from public.vehicles v where v.conducteur_id = p.id and v.actif) as modele,
  (select v.couleur from public.vehicles v where v.conducteur_id = p.id and v.actif) as couleur
from public.documents_conducteur d
join public.profiles p on p.id = d.profil_id
-- Réservée à l'administration. Sans ce filtre, la vue servirait le nom complet
-- et le numéro de tous les candidats à n'importe quel compte connecté.
where public.est_admin()
  and p.documents_valides_le is null
group by p.id
having count(*) filter (where d.statut = 'en_attente') > 0
order by min(d.cree_le);

revoke all on public.dossiers_en_attente from anon, authenticated;
grant select on public.dossiers_en_attente to authenticated;

comment on view public.dossiers_en_attente is
  'File d''attente de l''administration. Le filtre `est_admin()` est DANS la vue : sans lui, elle servirait nom complet et téléphone de tous les candidats.';

-- ------------------------------------------- lire un dossier, en admin --
-- Les pièces d'une personne, avec leur chemin de stockage : c'est ce chemin que
-- le client échange contre une URL signée.
create function public.dossier_du_candidat(p_profil uuid)
returns setof public.documents_conducteur
language sql
stable
security definer
set search_path = ''
as $$
  select d.*
  from public.documents_conducteur d
  where d.profil_id = p_profil
    and public.est_admin()
  order by d.type;
$$;

revoke all on function public.dossier_du_candidat(uuid) from public, anon, authenticated;
grant execute on function public.dossier_du_candidat(uuid) to authenticated;

-- ------------------------------------------------------------ décider --
-- `decider_document()` change d'exécutant : elle passe de `service_role` à
-- « un profil marqué admin ». Le corps vérifie, il ne fait pas confiance au
-- `grant` : un droit accordé par erreur ne doit pas suffire.
--
-- `drop` + `create` : la signature gagne le journal, donc RE-GRANT obligatoire.
drop function public.decider_document(uuid, public.type_document, boolean, text);

create function public.decider_document(
  p_profil uuid,
  p_type public.type_document,
  p_valide boolean,
  p_motif text default null
)
returns public.documents_conducteur
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc public.documents_conducteur;
  v_complet boolean;
begin
  -- Deux verrous plutôt qu'un : le `grant` dit qui peut appeler, ce test dit
  -- qui a le droit. Le jour où le grant s'élargit par distraction, celui-ci
  -- tient encore.
  if v_uid is not null and not public.est_admin(v_uid) then
    raise exception 'reserve_admin'
      using errcode = 'P0001',
            detail = 'Seul un profil administrateur décide d''un dossier.';
  end if;

  if not p_valide and nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'motif_requis'
      using errcode = 'P0001',
            detail = 'Un refus sans motif ne se corrige pas.';
  end if;

  update public.documents_conducteur
  set statut = (case when p_valide then 'valide' else 'refuse' end)::public.statut_document,
      motif_refus = case when p_valide then null else btrim(p_motif) end,
      decide_le = now()
  where profil_id = p_profil and type = p_type
  returning * into v_doc;

  if v_doc.profil_id is null then
    raise exception 'document_introuvable' using errcode = 'P0001';
  end if;

  -- Le journal, avant tout le reste : une décision non tracée est une décision
  -- qu'on ne pourra pas défendre.
  insert into public.decisions_documents (profil_id, type, decide_par, valide, motif)
  values (p_profil, p_type, coalesce(v_uid, p_profil), p_valide,
          case when p_valide then null else btrim(p_motif) end);

  -- Les quatre pièces, toutes validées.
  select count(*) filter (where statut = 'valide') = 4
    into v_complet
  from public.documents_conducteur
  where profil_id = p_profil;

  update public.profiles
  set documents_valides_le = case when v_complet then now() else null end
  where id = p_profil;

  return v_doc;
end;
$$;

revoke all on function public.decider_document(uuid, public.type_document, boolean, text)
  from public, anon, authenticated;
grant execute on function public.decider_document(uuid, public.type_document, boolean, text)
  to authenticated, service_role;

comment on function public.decider_document(uuid, public.type_document, boolean, text) is
  'Valide ou refuse UNE pièce. Réservée aux profils est_admin — le corps le vérifie, il ne se fie pas au grant. La capacité de conduire s''ouvre toute seule quand les quatre pièces passent au vert ET qu''un véhicule actif existe : voir est_conducteur().';

-- -------------------------------------------- lire les pièces d'un autre --
-- La policy de stockage ne sert un objet qu'à son propriétaire. L'admin doit
-- pouvoir les regarder — c'est tout l'objet de son travail.
create policy documents_conducteur_lecture_admin on storage.objects
  for select to authenticated
  using (bucket_id = 'documents-conducteur' and public.est_admin());
