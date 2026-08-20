-- Flex — les lieux qu'on enregistre une fois pour ne plus les rechercher.
--
-- Toute la valeur est dans le raccourci : « Domicile » en tête du choix de
-- destination, un appui, c'est choisi. Une liste de favoris qu'il faut aller
-- chercher dans un réglage ne sert à rien.
--
-- CE QUI NE CHANGE PAS : un favori est un point comme un autre. La maille et la
-- commune avant acceptation, jamais le libellé ni le texte libre. C'est pour ça
-- que l'application n'envoie PAS « Domicile » dans `destination_libelle` — cette
-- colonne-là, le conducteur la voit.
create type public.type_lieu_favori as enum ('domicile', 'travail', 'autre');

create table public.lieux_favoris (
  id uuid primary key default gen_random_uuid(),
  proprietaire uuid not null references public.profiles (id) on delete cascade,
  type public.type_lieu_favori not null,

  -- Nommé par l'utilisateur pour 'autre' SEULEMENT : « Domicile » et « Travail »
  -- sont des mots de l'interface, ils se traduisent et ne se stockent pas.
  libelle text check (length(btrim(libelle)) between 1 and 40),

  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),

  -- Le « précisez » habituel : « immeuble bleu, 3e étage ». Privé, toujours.
  precision_texte text check (length(btrim(precision_texte)) between 1 and 120),

  geo extensions.geography(Point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography
    ) stored,

  cree_le timestamptz not null default now(),

  -- Un libellé pour 'autre', et seulement pour lui.
  constraint lieux_favoris_libelle_si_autre
    check ((type = 'autre') = (libelle is not null))
);

-- Un seul domicile, un seul travail. Le reste est libre.
create unique index lieux_favoris_uniques
  on public.lieux_favoris (proprietaire, type)
  where type in ('domicile', 'travail');

create index lieux_favoris_proprietaire on public.lieux_favoris (proprietaire);

comment on table public.lieux_favoris is
  'Lieux enregistrés. Le libellé et la précision sont PRIVÉS : ils ne partent jamais dans depart_libelle ni destination_libelle, que le conducteur peut voir.';

alter table public.lieux_favoris enable row level security;
revoke all on public.lieux_favoris from anon, authenticated;
grant select on public.lieux_favoris to authenticated;

-- Chacun les siens. La policy de lecture est la seule qui serve au client ;
-- celles d'écriture sont une seconde serrure, au cas où un `grant` d'écriture
-- serait posé un jour par distraction — l'écriture passe par les RPC.
create policy lieux_favoris_lecture on public.lieux_favoris
  for select to authenticated
  using (proprietaire = (select auth.uid()));

create policy lieux_favoris_ecriture on public.lieux_favoris
  for insert to authenticated
  with check (proprietaire = (select auth.uid()));

create policy lieux_favoris_modification on public.lieux_favoris
  for update to authenticated
  using (proprietaire = (select auth.uid()));

create policy lieux_favoris_suppression on public.lieux_favoris
  for delete to authenticated
  using (proprietaire = (select auth.uid()));

-- ------------------------------------------------------------ enregistrer --
/** Au-delà, ce n'est plus une liste de raccourcis, c'est un annuaire. */
create function public.plafond_lieux_favoris() returns integer
language sql immutable parallel safe set search_path = ''
as $$ select 20 $$;

revoke all on function public.plafond_lieux_favoris() from public, anon, authenticated;

create function public.enregistrer_lieu_favori(
  p_type public.type_lieu_favori,
  p_lat double precision,
  p_lon double precision,
  p_libelle text default null,
  p_precision text default null,
  p_id uuid default null
)
returns public.lieux_favoris
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_favori public.lieux_favoris;
  v_libelle text := nullif(btrim(coalesce(p_libelle, '')), '');
  v_precision text := nullif(btrim(coalesce(p_precision, '')), '');
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_type = 'autre' and v_libelle is null then
    raise exception 'libelle_requis'
      using errcode = 'P0001',
            detail = 'Un lieu « autre » se nomme, sinon on ne le retrouve pas.';
  end if;

  -- « Domicile » et « Travail » sont nommés par l'interface. Accepter un
  -- libellé ici laisserait deux sources pour le même mot, et elles finiraient
  -- par diverger d'une langue à l'autre.
  if p_type <> 'autre' then
    v_libelle := null;
  end if;

  if p_id is not null then
    update public.lieux_favoris
    set type = p_type, libelle = v_libelle, lat = p_lat, lon = p_lon,
        precision_texte = v_precision
    where id = p_id and proprietaire = v_uid
    returning * into v_favori;

    if v_favori.id is null then
      raise exception 'favori_introuvable' using errcode = 'P0001';
    end if;
    return v_favori;
  end if;

  if (select count(*) from public.lieux_favoris where proprietaire = v_uid)
     >= public.plafond_lieux_favoris() then
    raise exception 'trop_de_favoris' using errcode = 'P0001';
  end if;

  insert into public.lieux_favoris (proprietaire, type, libelle, lat, lon, precision_texte)
  values (v_uid, p_type, v_libelle, p_lat, p_lon, v_precision)
  -- Redéclarer son domicile le DÉPLACE, il n'en crée pas un second.
  on conflict (proprietaire, type) where type in ('domicile', 'travail')
    do update set lat = excluded.lat, lon = excluded.lon,
                  precision_texte = excluded.precision_texte
  returning * into v_favori;

  return v_favori;
end;
$$;

revoke all on function public.enregistrer_lieu_favori(
  public.type_lieu_favori, double precision, double precision, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.enregistrer_lieu_favori(
  public.type_lieu_favori, double precision, double precision, text, text, uuid)
  to authenticated;

-- -------------------------------------------------------------- supprimer --
create function public.supprimer_lieu_favori(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_supprimes integer;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  delete from public.lieux_favoris where id = p_id and proprietaire = v_uid;
  get diagnostics v_supprimes = row_count;

  if v_supprimes = 0 then
    raise exception 'favori_introuvable' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.supprimer_lieu_favori(uuid) from public, anon, authenticated;
grant execute on function public.supprimer_lieu_favori(uuid) to authenticated;
