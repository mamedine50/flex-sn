-- Flex — planification d'expire_stale().
--
-- Un statut qui ment produit toujours une chasse au bug, et elle coûte plus cher
-- que cette migration. Les vues et les fonctions refusent déjà une demande
-- échue, donc rien ne fuit ; mais tant que personne ne passe, `statut` dit
-- « ouverte » sur une demande morte, et un jour quelqu'un se fiera au statut.
--
-- Une minute : c'est le grain le plus fin de pg_cron, et une offre urbaine vit
-- deux minutes. Attendre plus laisserait voir des offres déjà mortes.
--
-- pg_cron n'est pas disponible partout : la migration s'adapte plutôt que
-- d'échouer. Là où l'extension manque, elle est inerte et le dit.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : expire_stale() n''est pas planifiée ici.';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Rejouable : une migration se rejoue sur une base neuve, et `schedule` sur un
  -- nom existant remplace au lieu de dupliquer — mais on nettoie pour que le
  -- comportement soit le même partout.
  perform cron.unschedule('flex-expire-stale')
  where exists (select 1 from cron.job where jobname = 'flex-expire-stale');

  perform cron.schedule(
    'flex-expire-stale',
    '* * * * *',
    $cron$ select public.expire_stale() $cron$
  );
end;
$$;
