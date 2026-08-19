-- Flex — aucune fonction n'est exécutable par `anon`.
--
-- Les droits par défaut de Supabase accordent `execute` à `anon` et
-- `authenticated` sur TOUTE fonction créée dans `public`. Ce n'est pas un
-- oubli de notre part, c'est le comportement du projet : chaque fonction hérite
-- de droits que personne n'a demandés.
--
-- Ces quatre-là sont inoffensives — elles rendent une constante ou un arrondi.
-- Mais « inoffensif » n'est pas un critère : c'est au test d'inventaire de dire
-- ce qui est ouvert, pas à une relecture d'advisors six mois plus tard.
-- `authenticated` non plus : ces fonctions sont appelées DEPUIS les vues et les
-- fonctions SECURITY DEFINER, qui s'exécutent avec les droits de leur
-- propriétaire. Personne n'a besoin de les appeler directement.
--
-- Et il faut retirer à `public` AUSSI : Postgres accorde `execute` au
-- pseudo-rôle PUBLIC à la création d'une fonction, et `anon` en hérite. Révoquer
-- nommément à `anon` ne retire qu'un octroi nominatif qui n'existait pas — le
-- droit passe toujours par PUBLIC, et `has_function_privilege` le voit.
revoke all on function public.taille_cellule_deg()
  from public, anon, authenticated;
revoke all on function public.arrondir_zone(double precision)
  from public, anon, authenticated;
revoke all on function public.duree_demande(public.service_course)
  from public, anon, authenticated;
revoke all on function public.duree_offre(public.service_course)
  from public, anon, authenticated;

-- Sémantique de `prix_modifie`, qui ne survivra pas six mois sans explication.
comment on column public.events_prix.prix_modifie is
$c$Le passager a-t-il touché au pré-rempli ?

Vrai aussi quand AUCUNE recommandation n'était affichée : il n'y avait rien à
modifier, mais le prix est alors entièrement celui du passager — ce qui est plus
informatif encore pour le 25e centile de stats_routes. Ce que la colonne isole
n'est pas « a cliqué sur + » mais « ce prix n'est pas l'écho de notre
recommandation ».

Calculé en base, jamais déclaré par le client : c'est lui qui a intérêt au
résultat.$c$;
