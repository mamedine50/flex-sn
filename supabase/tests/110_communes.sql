-- Les communes : ce que l'approximation par centroïde tient, et ce qu'elle rate.
--
-- Le bloc `todo` en fin de fichier porte une dette assumée. Il ne fait pas tomber
-- la CI, il reste visible dans la sortie pgTAP, et il passera au vert le jour où
-- les polygones réels remplaceront les centroïdes. Une dette qu'aucun test ne
-- porte est une dette qu'on oublie.
begin;
create extension if not exists pgtap with schema public;

select plan(8);

select is(
  (select count(*)::int from public.communes),
  32,
  'les communes de la V1 sont en seed'
);

select is(
  public.commune_la_plus_proche(14.7220::double precision, -17.4900::double precision),
  'Ouakam',
  'au cœur d''une commune, l''attribution est juste'
);

select is(
  public.commune_la_plus_proche(14.7910::double precision, -16.9260::double precision),
  'Thiès',
  'les destinations interurbaines sont nommées'
);

-- Le plafond de distance : sans lui, un point au large se verrait attribuer une
-- commune avec aplomb.
select ok(
  public.commune_la_plus_proche(20.0::double precision, -30.0::double precision) is null,
  'un point hors zone ne rend aucune commune plutôt qu''une commune fausse'
);

select ok(
  public.commune_la_plus_proche(
    14.6928::double precision, -17.4467::double precision) is not null,
  'un point de Dakar rend toujours une commune'
);

-- ------------------------------------------------ la dette, et sa résolution --
-- Le `todo` de ce fichier attendait que 14,6928 / -17,4467 soit nommé
-- « Plateau ». L'extraction OpenStreetMap a montré que L'ATTENTE était fausse,
-- pas les centroïdes : ce point est à 292 m de Colobane et à 2 985 m de
-- Dakar-Plateau, que OSM place à 14,6673. Il n'a jamais été dans le Plateau.
--
-- On garde donc les deux assertions, avec les bonnes coordonnées cette fois :
-- une par lieu, vérifiable sur une carte.
select is(
  public.commune_la_plus_proche(14.6673::double precision, -17.4380::double precision),
  'Plateau',
  'le vrai Plateau — celui d''OpenStreetMap — est bien nommé « Plateau »'
);

select is(
  public.commune_la_plus_proche(14.6928::double precision, -17.4467::double precision),
  'Gueule Tapée–Fass–Colobane',
  'et le point qu''on croyait « Plateau » est à Colobane, sa vraie commune'
);

-- ------------------------------------------------------------ les lieux --
-- « Scat Urbam » n'existe dans OSM que comme ARRÊT de BRT. C'est pourtant ce que
-- tout Dakarois tape : à Dakar on se repère aux arrêts, pas aux limites
-- administratives.
select isnt_empty(
  $$ select 1 from public.lieux where nom = 'Scat Urbam' $$,
  'Scat Urbam se trouve — via l''arrêt, faute de quartier dans OSM'
);

select * from finish();
rollback;
