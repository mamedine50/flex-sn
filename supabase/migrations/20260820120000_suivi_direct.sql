-- Flex — le suivi en direct du conducteur.
--
-- Deux resserrages et un ajout.

-- 1. Le CAP, pour orienter le marqueur. Sans lui la voiture glisse de côté sur
--    la carte, ce qui se lit comme un bug avant de se lire comme une voiture.
alter table public.positions_conducteurs
  add column cap smallint check (cap is null or cap between 0 and 359);

comment on column public.positions_conducteurs.cap is
  'Cap en degrés, quand le téléphone le donne. NULL est fréquent à l''arrêt — le marqueur garde alors sa dernière orientation.';

-- 2. La position n'est servie que pendant le DÉPLACEMENT.
--
-- `course_active` inclut `verrouillee` — l'instant entre l'acceptation et le
-- départ. Pendant cet instant le conducteur n'a aucune raison d'être suivi : il
-- n'a pas encore dit qu'il partait. Suivre quelqu'un qui n'a pas commencé à
-- venir, c'est de la collecte sans usage.
create function public.course_en_deplacement(p_statut public.statut_course)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_statut in ('en_route', 'arrive', 'commencee', 'en_cours');
$$;

revoke all on function public.course_en_deplacement(public.statut_course)
  from public, anon;
-- Appelée depuis une policy : vérifiée contre celui qui interroge.
grant execute on function public.course_en_deplacement(public.statut_course)
  to authenticated;

comment on function public.course_en_deplacement(public.statut_course) is
  'La course a commencé à bouger. Plus étroit que course_active : la position du conducteur n''est servie qu''à partir de là.';

drop policy positions_passager_course_active on public.positions_conducteurs;
create policy positions_passager_course_en_deplacement on public.positions_conducteurs
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where c.conducteur_id = public.positions_conducteurs.conducteur_id
        and c.passager_id = (select auth.uid())
        and public.course_en_deplacement(c.statut)
    )
  );

-- 3. `maj_position` accepte le cap. La signature change : drop + create, donc
--    RE-GRANT obligatoire, et une assertion le vérifie.
drop function if exists public.maj_position(double precision, double precision, boolean);

create function public.maj_position(
  p_lat double precision,
  p_lon double precision,
  p_en_ligne boolean default true,
  p_cap smallint default null
)
returns public.positions_conducteurs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_position public.positions_conducteurs;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  insert into public.positions_conducteurs
    (conducteur_id, lat, lon, en_ligne, cap, maj_le)
  values (v_uid, p_lat, p_lon, p_en_ligne, p_cap, now())
  on conflict (conducteur_id) do update
    set lat = excluded.lat,
        lon = excluded.lon,
        en_ligne = excluded.en_ligne,
        cap = coalesce(excluded.cap, public.positions_conducteurs.cap),
        maj_le = now()
  returning * into v_position;

  return v_position;
end;
$$;

revoke all on function public.maj_position(
  double precision, double precision, boolean, smallint)
  from public, anon, authenticated;
grant execute on function public.maj_position(
  double precision, double precision, boolean, smallint) to authenticated;
