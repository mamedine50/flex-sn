-- Flex — publier les évaluations restées seules.
--
-- Toutes les heures : le délai de sept jours n'a pas besoin d'être au grain de
-- la minute, et `publier_evaluations()` ne regarde qu'une fenêtre de deux heures
-- pour ne pas recalculer tout l'historique à chaque passage.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : publier_evaluations() n''est pas planifiée ici.';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.unschedule('flex-publier-evaluations')
  where exists (select 1 from cron.job where jobname = 'flex-publier-evaluations');

  perform cron.schedule(
    'flex-publier-evaluations',
    '7 * * * *',
    $cron$ select public.publier_evaluations() $cron$
  );
end;
$$;
