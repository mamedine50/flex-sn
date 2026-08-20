-- Flex — devenir conducteur.
--
-- Quatre pièces à fournir, une validation à la main, et un statut que le
-- candidat VOIT. Un dossier qui reste muet pendant trois semaines, c'est un
-- conducteur qui abandonne.

create type public.type_document as enum (
  'piece_identite', 'permis', 'carte_grise', 'selfie'
);

create type public.statut_document as enum ('en_attente', 'valide', 'refuse');

create table public.documents_conducteur (
  profil_id uuid not null references public.profiles (id) on delete cascade,
  type public.type_document not null,
  -- Chemin dans le bucket, pas une URL : les URL signées expirent, le chemin non.
  chemin text not null check (length(btrim(chemin)) between 1 and 300),
  statut public.statut_document not null default 'en_attente',
  -- Un refus SANS motif est un refus qu'on ne peut pas corriger.
  motif_refus text check (length(btrim(motif_refus)) between 3 and 300),
  cree_le timestamptz not null default now(),
  decide_le timestamptz,
  primary key (profil_id, type),
  check (statut <> 'refuse' or motif_refus is not null)
);

comment on table public.documents_conducteur is
  'Pièces du dossier conducteur. Validation à la MAIN par service_role tant que le back-office n''existe pas — c''est assumé et listé dans les bloquants.';

alter table public.documents_conducteur enable row level security;
revoke all on public.documents_conducteur from anon, authenticated;
grant select on public.documents_conducteur to authenticated;

-- On voit son propre dossier, et rien d'autre. Personne ne voit les pièces
-- d'identité de personne.
create policy documents_les_siens on public.documents_conducteur
  for select to authenticated
  using (profil_id = (select auth.uid()));

-- ------------------------------------------------------------- déposer --
create function public.soumettre_document(
  p_type public.type_document,
  p_chemin text
)
returns public.documents_conducteur
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc public.documents_conducteur;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  -- Le chemin DOIT être sous le dossier de l'appelant. Sans ce contrôle, on
  -- pourrait déclarer le document de quelqu'un d'autre comme le sien.
  if p_chemin !~ ('^' || v_uid::text || '/') then
    raise exception 'chemin_etranger'
      using errcode = 'P0001',
            detail = 'Un document se dépose dans son propre dossier.';
  end if;

  insert into public.documents_conducteur (profil_id, type, chemin)
  values (v_uid, p_type, btrim(p_chemin))
  on conflict (profil_id, type) do update
    -- Redéposer après un refus remet la pièce en attente, et efface le motif :
    -- un motif qui survit à la correction accuse de quelque chose de corrigé.
    set chemin = excluded.chemin,
        statut = 'en_attente',
        motif_refus = null,
        cree_le = now(),
        decide_le = null
  returning * into v_doc;

  return v_doc;
end;
$$;

revoke all on function public.soumettre_document(public.type_document, text)
  from public, anon, authenticated;
grant execute on function public.soumettre_document(public.type_document, text)
  to authenticated;

-- ------------------------------------------------------------ décider --
-- À la main, par service_role, tant que le back-office n'existe pas. Quand les
-- quatre pièces sont validées, `documents_valides_le` se pose et la capacité de
-- conduire s'ouvre — c'est le seul endroit qui l'accorde.
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
  v_doc public.documents_conducteur;
  v_complet boolean;
begin
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

revoke all on function public.decider_document(
  uuid, public.type_document, boolean, text) from public, anon, authenticated;
grant execute on function public.decider_document(
  uuid, public.type_document, boolean, text) to service_role;
