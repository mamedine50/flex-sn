-- Flex — la notation en double aveugle.
--
-- Chacun note l'autre sans voir sa note. Les deux se dévoilent quand les DEUX
-- ont noté, ou au bout de sept jours si l'un ne note jamais.
--
-- Sans ce double aveugle, la première note publiée conditionne la seconde :
-- personne ne met 3 étoiles à quelqu'un qui vient de lui en mettre 5, et
-- personne n'ose mettre 5 après avoir reçu 2. Les notes convergent vers une
-- moyenne polie qui ne dit plus rien.
create table public.evaluations (
  course_id uuid not null references public.rides (id) on delete cascade,
  auteur_id uuid not null references public.profiles (id) on delete cascade,
  cible_id uuid not null references public.profiles (id) on delete cascade,
  note smallint not null check (note between 1 and 5),
  commentaire text check (length(btrim(commentaire)) between 1 and 500),
  cree_le timestamptz not null default now(),
  primary key (course_id, auteur_id)
);

create index evaluations_par_cible on public.evaluations (cible_id);

comment on table public.evaluations is
  'Notation en double aveugle. Rien n''est visible avant que les deux aient noté, ou avant sept jours. Voir evaluations_visibles.';

alter table public.evaluations enable row level security;
revoke all on public.evaluations from anon, authenticated;
grant select on public.evaluations to authenticated;

-- On voit ce qu'on a écrit soi-même, à tout moment. Pas ce qu'on a reçu.
create policy evaluations_les_siennes on public.evaluations
  for select to authenticated
  using (auteur_id = (select auth.uid()));

/**
 * Le délai au-delà duquel une note se publie même si l'autre n'a jamais noté.
 */
create function public.delai_double_aveugle() returns interval
language sql immutable parallel safe set search_path = ''
as $$ select interval '7 days' $$;

revoke all on function public.delai_double_aveugle()
  from public, anon, authenticated;

-- Les évaluations DÉVOILÉES. C'est cette vue que lisent les moyennes.
create view public.evaluations_visibles
with (security_invoker = false) as
select e.*
from public.evaluations e
join public.rides c on c.id = e.course_id
where
  -- les deux ont noté
  (select count(*) from public.evaluations a where a.course_id = e.course_id) = 2
  -- ou le délai est passé
  or (c.terminee_le is not null
      and c.terminee_le + public.delai_double_aveugle() <= now());

comment on view public.evaluations_visibles is
  'Évaluations dévoilées : les deux ont noté, ou sept jours ont passé. C''est la seule source des moyennes.';

revoke all on public.evaluations_visibles from anon, authenticated;
grant select on public.evaluations_visibles to authenticated;

-- ------------------------------------------------------------ noter --
create function public.noter_course(
  p_course_id uuid,
  p_note smallint,
  p_commentaire text default null
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
  v_eval public.evaluations;
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

  insert into public.evaluations (course_id, auteur_id, cible_id, note, commentaire)
  values (p_course_id, v_uid, v_cible, p_note, nullif(btrim(p_commentaire), ''))
  on conflict (course_id, auteur_id) do nothing
  returning * into v_eval;

  if v_eval.course_id is null then
    raise exception 'deja_note' using errcode = 'P0001';
  end if;

  -- Si la seconde note vient de tomber, les deux se dévoilent : on recalcule
  -- les moyennes des deux personnes d'un coup.
  perform public.recalculer_notes(p_course_id);

  return v_eval;
end;
$$;

-- Recalcule la moyenne des personnes concernées par une course, à partir des
-- seules évaluations DÉVOILÉES.
create function public.recalculer_notes(p_course_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
  set note_moyenne = agg.moyenne,
      nb_notes = agg.nombre
  from (
    select v.cible_id,
           round(avg(v.note)::numeric, 1) as moyenne,
           count(*)::integer as nombre
    from public.evaluations_visibles v
    where v.cible_id in (
      select passager_id from public.rides where id = p_course_id
      union
      select conducteur_id from public.rides where id = p_course_id
    )
    group by v.cible_id
  ) agg
  where p.id = agg.cible_id;
end;
$$;

revoke all on function public.recalculer_notes(uuid)
  from public, anon, authenticated;

revoke all on function public.noter_course(uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.noter_course(uuid, smallint, text) to authenticated;

-- ---------------------------------------------------- publication différée --
-- Le cas où l'un ne note jamais : au bout de sept jours, la note de l'autre se
-- publie quand même. Appelée par pg_cron — jamais par un client.
create function public.publier_evaluations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courses uuid[];
  v_id uuid;
begin
  select array_agg(distinct c.id) into v_courses
  from public.rides c
  join public.evaluations e on e.course_id = c.id
  where c.statut = 'terminee'
    and c.terminee_le is not null
    and c.terminee_le + public.delai_double_aveugle() <= now()
    and c.terminee_le + public.delai_double_aveugle()
        > now() - interval '2 hours';

  if v_courses is null then
    return 0;
  end if;

  foreach v_id in array v_courses loop
    perform public.recalculer_notes(v_id);
  end loop;

  return array_length(v_courses, 1);
end;
$$;

revoke all on function public.publier_evaluations()
  from public, anon, authenticated;
grant execute on function public.publier_evaluations() to service_role;
