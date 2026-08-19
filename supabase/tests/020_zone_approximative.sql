-- La zone servie avant acceptation est arrondie de façon STABLE.
--
-- Ce fichier existe pour empêcher une « amélioration » précise : remplacer
-- l'arrondi par un bruit aléatoire. Un bruit paraît plus protecteur — il ne
-- l'est pas. Re-tiré à chaque lecture, il se moyenne : mille lectures d'un
-- point bruité convergent vers le point exact. L'arrondi, lui, n'apprend rien
-- de plus la millième fois que la première.
begin;
create extension if not exists pgtap with schema public;

select plan(9);

-- Un vrai point : Plateau, Dakar.
create temp table point_reel as
select 14.6928::double precision as lat, -17.4467::double precision as lon;

-- 1. Déterminisme — mille lectures, une seule valeur.
select is(
  (select count(distinct public.arrondir_zone(lat))::int
   from point_reel, generate_series(1, 1000)),
  1,
  'mille lectures de la même coordonnée rendent une seule zone'
);

-- 2. La moyenne des lectures ne trahit pas le point.
--    Avec un bruit centré, cette moyenne convergerait vers `lat`.
select isnt(
  (select avg(public.arrondir_zone(lat)) from point_reel, generate_series(1, 1000)),
  (select lat from point_reel),
  'la moyenne de mille lectures ne rend pas la coordonnée exacte'
);

-- 3. C'est une grille, pas un flou : deux points distincts d'une même maille
--    rendent exactement la même zone.
select is(
  public.arrondir_zone(14.6928::double precision),
  public.arrondir_zone(14.6941::double precision),
  'deux points de la même maille rendent la même zone'
);

-- 4. Deux mailles voisines restent distinctes — sinon la zone ne dit plus rien.
select isnt(
  public.arrondir_zone(14.6928::double precision),
  public.arrondir_zone(14.6994::double precision),
  'deux mailles voisines rendent des zones différentes'
);

-- 5. L'écart au point réel est borné par la demi-maille : la zone reste utile
--    au conducteur (≈ 550 m à Dakar), elle ne le renvoie pas à l'autre bout.
select ok(
  (select abs(public.arrondir_zone(lat) - lat) <= public.taille_cellule_deg() / 2
   from point_reel),
  'la zone est à moins d''une demi-maille du point réel'
);
select ok(
  (select abs(public.arrondir_zone(lon) - lon) <= public.taille_cellule_deg() / 2
   from point_reel),
  'idem en longitude'
);

-- 6. La zone n'est jamais le point.
select isnt(
  (select public.arrondir_zone(lat) from point_reel),
  (select lat from point_reel),
  'la zone servie n''est pas la coordonnée exacte'
);

-- 7. Le centre de maille, et rien d'autre : la valeur est prévisible et
--    vérifiable à la main.
-- Comparaison à 1e-9 près : le calcul est en flottant, 14,6925 calculé et
-- 14,6925 écrit ne partagent pas le même bit de poids faible. Ce qui compte est
-- que la valeur soit prévisible, pas qu'elle soit binairement identique.
select ok(
  abs(public.arrondir_zone(14.6928::double precision) - 14.6925::double precision) < 1e-9,
  'la zone est le centre de la maille de 0,005°'
);

-- 8. La fonction est IMMUTABLE. Une fonction volatile pourrait rendre un
--    résultat différent à chaque appel — c'est exactement ce qu'on interdit.
select is(
  (select provolatile::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'arrondir_zone'),
  'i',
  'arrondir_zone() est IMMUTABLE : elle ne peut pas devenir aléatoire'
);

select * from finish();
rollback;
