-- Flex — piloter la course, l'annuler, la noter.

-- ------------------------------------------------------------ course active --
-- Une course « active » lie deux personnes : elle ouvre l'accès au nom complet,
-- au numéro, à la plaque et à la position exacte. La liste des statuts concernés
-- était recopiée dans cinq policies, un index et deux fonctions — c'est-à-dire
-- sept endroits où en oublier un.
create function public.course_active(p_statut public.statut_course)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_statut in ('verrouillee', 'en_route', 'arrive', 'commencee', 'en_cours');
$$;

revoke all on function public.course_active(public.statut_course)
  from public, anon;

-- `authenticated` EN A BESOIN : une fonction appelée depuis une policy RLS est
-- évaluée avec les droits de celui qui interroge, pas du propriétaire de la
-- table. Sans ce grant, toute lecture de `profiles` ou de `vehicles` échoue en
-- « permission denied for function course_active ».
--
-- L'exposer ne révèle rien : elle prend un statut et rend un booléen.
grant execute on function public.course_active(public.statut_course) to authenticated;

comment on function public.course_active(public.statut_course) is
  'Une course en cours de vie. C''est CE prédicat qui ouvre l''accès aux données confidentielles de la contrepartie — le modifier élargit ou referme la confidentialité partout à la fois.';

-- L'index de dernier recours suit la même définition.
drop index public.rides_conducteur_actif_unique;
create unique index rides_conducteur_actif_unique
  on public.rides (conducteur_id) where public.course_active(statut);

-- ---------------------------------------------------------------- policies --
drop policy profiles_contrepartie_course_active on public.profiles;
create policy profiles_contrepartie_course_active on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where public.course_active(c.statut)
        and (
          (c.conducteur_id = (select auth.uid()) and c.passager_id = public.profiles.id)
          or (c.passager_id = (select auth.uid()) and c.conducteur_id = public.profiles.id)
        )
    )
  );

-- La PLAQUE. Servie uniquement sur la course active de l'appelant, et dans les
-- DEUX sens : le passager la lit pour monter dans la bonne voiture, le
-- conducteur lit la sienne. Jamais dans la file d'offres — `vehicules_publics`
-- ne la porte pas.
drop policy vehicles_course_active on public.vehicles;
create policy vehicles_course_active on public.vehicles
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where c.vehicule_id = public.vehicles.id
        and public.course_active(c.statut)
        and (c.passager_id = (select auth.uid()) or c.conducteur_id = (select auth.uid()))
    )
  );

drop policy ride_requests_conducteur_apres_acceptation on public.ride_requests;
create policy ride_requests_conducteur_apres_acceptation on public.ride_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where c.demande_id = public.ride_requests.id
        and c.conducteur_id = (select auth.uid())
        and public.course_active(c.statut)
    )
  );

drop policy positions_passager_course_active on public.positions_conducteurs;
create policy positions_passager_course_active on public.positions_conducteurs
  for select to authenticated
  using (
    exists (
      select 1 from public.rides c
      where c.conducteur_id = public.positions_conducteurs.conducteur_id
        and c.passager_id = (select auth.uid())
        and public.course_active(c.statut)
    )
  );

-- -------------------------------------------------------- avancer la course --
-- Le conducteur pilote. Le passager suit — il ne décide pas qu'il est monté.
create function public.avancer_course(
  p_course_id uuid,
  p_statut public.statut_course
)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_course public.rides;
  v_attendu public.statut_course;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select * into v_course from public.rides where id = p_course_id for update;

  if v_course.id is null then
    raise exception 'course_introuvable' using errcode = 'P0001';
  end if;

  if v_course.conducteur_id <> v_uid then
    raise exception 'course_etrangere'
      using errcode = 'P0001', detail = 'Seul le conducteur avance la course.';
  end if;

  -- Un seul pas à la fois, dans un seul sens. Sauter une étape effacerait un
  -- moment que le passager attend de voir passer.
  v_attendu := case v_course.statut
    when 'verrouillee' then 'en_route'
    when 'en_route' then 'arrive'
    when 'arrive' then 'commencee'
    when 'commencee' then 'terminee'
    else null
  end;

  if v_attendu is null then
    raise exception 'course_terminee'
      using errcode = 'P0001', detail = format('Statut : %s.', v_course.statut);
  end if;

  if p_statut <> v_attendu then
    raise exception 'etape_invalide'
      using errcode = 'P0001',
            detail = format('Depuis %s, l''étape suivante est %s.',
                            v_course.statut, v_attendu);
  end if;

  update public.rides
  set statut = p_statut,
      terminee_le = case when p_statut = 'terminee' then now() else terminee_le end
  where id = p_course_id
  returning * into v_course;

  return v_course;
end;
$$;

revoke all on function public.avancer_course(uuid, public.statut_course)
  from public, anon, authenticated;
grant execute on function public.avancer_course(uuid, public.statut_course) to authenticated;

-- ------------------------------------------------------------- annuler --
-- Les deux parties peuvent annuler, tant que la course n'a pas COMMENCÉ. Une
-- fois le passager à bord, « annuler » n'a plus de sens : la course se termine.
create function public.annuler_course(p_course_id uuid, p_motif text default null)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_course public.rides;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  select * into v_course from public.rides where id = p_course_id for update;

  if v_course.id is null then
    raise exception 'course_introuvable' using errcode = 'P0001';
  end if;

  if v_course.passager_id <> v_uid and v_course.conducteur_id <> v_uid then
    raise exception 'course_etrangere' using errcode = 'P0001';
  end if;

  -- Annulation croisée : le premier gagne, le second reçoit une phrase claire
  -- plutôt qu'un état incohérent.
  if v_course.statut = 'annulee' then
    raise exception 'course_deja_annulee' using errcode = 'P0001';
  end if;

  if v_course.statut in ('commencee', 'terminee') then
    raise exception 'course_commencee'
      using errcode = 'P0001',
            detail = 'Une course commencée ne s''annule pas, elle se termine.';
  end if;

  update public.rides
  set statut = 'annulee',
      annulee_par = v_uid,
      motif_annulation = nullif(btrim(p_motif), ''),
      terminee_le = now()
  where id = p_course_id
  returning * into v_course;

  -- La demande retombe : le passager peut reproposer sans attendre l'échéance.
  update public.ride_requests
  set statut = 'annulee'
  where id = v_course.demande_id;

  return v_course;
end;
$$;

revoke all on function public.annuler_course(uuid, text)
  from public, anon, authenticated;
grant execute on function public.annuler_course(uuid, text) to authenticated;

-- -------------------------------------------------------------- realtime --
alter table public.rides replica identity full;
alter publication supabase_realtime add table public.rides;
