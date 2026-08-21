-- Flex — ne plus jamais croiser quelqu'un.
--
-- Le blocage réciproque est un bloquant de lancement depuis le début, et la
-- ligne « Personnes bloquées » du Profil était inerte. Ce qui suit le rend réel.
--
-- LE POINT QUI COMPTE : un blocage qui se contenterait de cacher l'interface
-- serait du théâtre. Il tient donc DANS L'APPARIEMENT — la file du conducteur,
-- la liste d'offres du passager, et deux déclencheurs qui refusent l'offre et la
-- course. Les déclencheurs plutôt que les fonctions : ils attrapent tous les
-- chemins, y compris ceux qu'on écrira plus tard.
--
-- Ce que le blocage NE fait PAS : interrompre une course en cours. On ne fait
-- pas disparaître un conducteur qui est au volant avec quelqu'un dedans. Il vaut
-- pour l'avenir.
create table public.blocages (
  bloqueur uuid not null references public.profiles (id) on delete cascade,
  bloque uuid not null references public.profiles (id) on delete cascade,
  -- Facultatif, et privé : il sert à se souvenir de pourquoi, pas à accuser.
  motif text check (length(btrim(motif)) between 1 and 300),
  cree_le timestamptz not null default now(),

  primary key (bloqueur, bloque),
  constraint blocages_pas_soi_meme check (bloqueur <> bloque)
);

create index blocages_bloque on public.blocages (bloque);

comment on table public.blocages is
  'Blocages entre personnes. RÉCIPROQUE dans ses effets : peu importe qui a bloqué, les deux cessent de se voir. Sans quoi la personne bloquée continuerait de proposer, et le blocage ne protégerait de rien.';

alter table public.blocages enable row level security;
revoke all on public.blocages from anon, authenticated;
grant select on public.blocages to authenticated;

-- On voit les blocages qu'on a POSÉS. Jamais ceux qu'on subit : apprendre qu'on
-- a été bloqué est une information qui ne sert qu'à se venger.
create policy blocages_les_miens on public.blocages
  for select to authenticated
  using (bloqueur = (select auth.uid()));

-- ------------------------------------------------------- la règle, en une --
/**
 * L'un des deux a-t-il bloqué l'autre ?
 *
 * `security definer` : la policy ne sert que les blocages qu'on a posés, et
 * cette fonction doit voir les deux sens. C'est aussi pour ça qu'elle ne rend
 * qu'un booléen — elle ne dit jamais QUI a bloqué.
 */
create function public.est_bloque(p_un uuid, p_autre uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocages b
    where (b.bloqueur = p_un and b.bloque = p_autre)
       or (b.bloqueur = p_autre and b.bloque = p_un)
  );
$$;

revoke all on function public.est_bloque(uuid, uuid) from public, anon;
-- Appelée depuis des vues : le droit est vérifié contre l'appelant.
grant execute on function public.est_bloque(uuid, uuid) to authenticated;

-- ------------------------------------------------------------ bloquer --
create function public.bloquer(p_profil uuid, p_motif text default null)
returns public.blocages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_blocage public.blocages;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_profil = v_uid then
    raise exception 'blocage_de_soi' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_profil) then
    raise exception 'profil_absent' using errcode = 'P0001';
  end if;

  insert into public.blocages (bloqueur, bloque, motif)
  values (v_uid, p_profil, nullif(btrim(coalesce(p_motif, '')), ''))
  -- Rebloquer quelqu'un met le motif à jour, il ne double pas la ligne.
  on conflict (bloqueur, bloque) do update
    set motif = excluded.motif, cree_le = now()
  returning * into v_blocage;

  return v_blocage;
end;
$$;

revoke all on function public.bloquer(uuid, text) from public, anon, authenticated;
grant execute on function public.bloquer(uuid, text) to authenticated;

create function public.debloquer(p_profil uuid)
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

  -- On ne défait que SON propre blocage. Celui d'en face, s'il existe, reste.
  delete from public.blocages where bloqueur = v_uid and bloque = p_profil;
  get diagnostics v_supprimes = row_count;

  if v_supprimes = 0 then
    raise exception 'blocage_introuvable' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.debloquer(uuid) from public, anon, authenticated;
grant execute on function public.debloquer(uuid) to authenticated;

-- ---------------------------------------------------- la liste que je vois --
-- Le prénom et la photo de qui j'ai bloqué : sans eux, la liste est une suite
-- d'identifiants et on ne sait plus qui débloquer.
create view public.mes_blocages
with (security_invoker = false) as
select
  b.bloque as profil_id,
  p.prenom,
  p.photo_url,
  b.motif,
  b.cree_le
from public.blocages b
join public.profiles p on p.id = b.bloque
where b.bloqueur = (select auth.uid());

revoke all on public.mes_blocages from anon, authenticated;
grant select on public.mes_blocages to authenticated;

comment on view public.mes_blocages is
  'Les personnes que J''AI bloquées. Jamais celles qui m''ont bloqué : le savoir ne sert qu''à se venger.';

-- ------------------------------------------- l'appariement cesse de croiser --
-- La file du conducteur : on ne voit plus la demande de quelqu'un avec qui l'un
-- des deux a coupé.
create or replace view public.demandes_ouvertes
with (security_invoker = false) as
select
  d.id,
  d.service,
  d.prix_xof,
  d.expires_at,
  d.cree_le,
  public.arrondir_zone(d.depart_lat) as zone_depart_lat,
  public.arrondir_zone(d.depart_lon) as zone_depart_lon,
  d.destination_libelle,
  public.arrondir_zone(d.destination_lat) as zone_destination_lat,
  public.arrondir_zone(d.destination_lon) as zone_destination_lon,
  d.passager_id,
  p.prenom as passager_prenom,
  p.note_moyenne as passager_note,
  public.commune_la_plus_proche(
    public.arrondir_zone(d.depart_lat), public.arrondir_zone(d.depart_lon)
  ) as depart_commune,
  public.commune_la_plus_proche(
    d.destination_lat, d.destination_lon
  ) as destination_commune
from public.ride_requests d
join public.profiles p on p.id = d.passager_id
where d.statut = 'ouverte'
  and d.expires_at > now()
  and public.est_conducteur((select auth.uid()))
  and d.passager_id <> (select auth.uid())
  and not public.est_bloque((select auth.uid()), d.passager_id);

-- Les offres reçues : même règle, dans l'autre sens.
create or replace view public.offres_recues
with (security_invoker = false) as
select
  o.id,
  o.demande_id,
  o.type,
  o.prix_xof,
  o.delai_arrivee_min,
  o.statut,
  o.expires_at,
  o.cree_le,
  o.conducteur_id,
  p.prenom as conducteur_prenom,
  p.photo_url as conducteur_photo,
  p.note_moyenne as conducteur_note,
  p.nb_notes as conducteur_nb_notes,
  v.modele as vehicule_modele,
  v.couleur as vehicule_couleur,
  public.est_nouveau_conducteur(p.id) as conducteur_est_nouveau,
  public.courses_comme_conducteur(p.id) as conducteur_nb_courses
from public.offers o
join public.ride_requests d on d.id = o.demande_id
join public.profiles p on p.id = o.conducteur_id
join public.vehicles v on v.id = o.vehicule_id
where d.passager_id = (select auth.uid())
  and not public.est_bloque((select auth.uid()), o.conducteur_id);

-- ------------------------------------------------ et les portes se ferment --
-- Des DÉCLENCHEURS plutôt que des conditions dans `submit_offer()` et
-- `accept_offer()` : ils attrapent tous les chemins d'écriture, y compris ceux
-- qu'on écrira plus tard, et ils survivent à un `create or replace` de ces
-- fonctions. Cacher dans une vue ne suffit pas — l'identifiant d'une demande
-- circule, et il suffit de l'appeler à la main.
create function public.refuser_offre_si_bloque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passager uuid;
begin
  select passager_id into v_passager
  from public.ride_requests where id = new.demande_id;

  if public.est_bloque(new.conducteur_id, v_passager) then
    raise exception 'personne_bloquee'
      using errcode = 'P0001',
            detail = 'L''un des deux a bloqué l''autre.';
  end if;

  return new;
end;
$$;

revoke all on function public.refuser_offre_si_bloque() from public, anon, authenticated;

create trigger offres_refusent_les_bloques
before insert on public.offers
for each row execute function public.refuser_offre_si_bloque();

create function public.refuser_course_si_bloque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.est_bloque(new.passager_id, new.conducteur_id) then
    raise exception 'personne_bloquee'
      using errcode = 'P0001',
            detail = 'L''un des deux a bloqué l''autre.';
  end if;

  return new;
end;
$$;

revoke all on function public.refuser_course_si_bloque() from public, anon, authenticated;

create trigger courses_refusent_les_bloques
before insert on public.rides
for each row execute function public.refuser_course_si_bloque();
