-- Flex — les fonctions appelées DANS une vue sont vérifiées contre l'appelant.
--
-- Correction d'un défaut que j'avais introduit en fermant `arrondir_zone` :
-- Postgres vérifie l'accès aux TABLES d'une vue contre le propriétaire de la
-- vue, mais l'exécution des FONCTIONS contre celui qui interroge. Une vue en
-- `security_invoker = false` ne protège donc pas ses appels de fonctions.
--
-- Le défaut était LATENT : `demandes_ouvertes` filtre sur `est_conducteur()`, et
-- tant que ce filtre rend zéro ligne, `arrondir_zone` n'est jamais évaluée. La
-- vue « marchait » à vide et cassait dès la première demande à portée. C'est un
-- test de 080, avec des lignes, qui l'a montré.
--
-- Ces trois-là entrent donc dans la liste blanche d'`authenticated`, et
-- l'inventaire de 010 les nomme avec leur raison. Les exposer ne révèle rien :
-- un arrondi, une constante, un intervalle.
grant execute on function public.arrondir_zone(double precision) to authenticated;
grant execute on function public.taille_cellule_deg() to authenticated;
grant execute on function public.delai_double_aveugle() to authenticated;

comment on function public.arrondir_zone(double precision) is
  'Centre de la maille contenant la coordonnée. Déterministe : ne jamais remplacer par un bruit aléatoire, une moyenne de lectures trahirait le point exact. Exécutable par authenticated car appelée depuis la vue demandes_ouvertes, dont les fonctions sont vérifiées contre l''appelant.';
