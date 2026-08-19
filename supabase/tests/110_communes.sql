-- Les communes : ce que l'approximation par centroïde tient, et ce qu'elle rate.
--
-- Le bloc `todo` en fin de fichier porte une dette assumée. Il ne fait pas tomber
-- la CI, il reste visible dans la sortie pgTAP, et il passera au vert le jour où
-- les polygones réels remplaceront les centroïdes. Une dette qu'aucun test ne
-- porte est une dette qu'on oublie.
begin;
create extension if not exists pgtap with schema public;

select plan(6);

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

-- ------------------------------------------------------------------ dette --
-- 14,6928 / -17,4467 est le Plateau — le lieu le plus demandé de Dakar. Les
-- centroïdes saisis à la main le placent à Biscuiterie. Un conducteur à qui on
-- annonce la mauvaise commune décide mal : il refuse une course qu'il aurait
-- prise, ou il accepte et se plaint à l'arrivée. Une information fausse est pire
-- qu'aucune information.
--
-- Correction prévue : remplacer les centroïdes par les polygones réels des
-- communes (OpenStreetMap, extraction unique en seed, aucun appel réseau). La
-- signature de commune_la_plus_proche() ne bouge pas.
select todo('polygones réels des communes pas encore en seed — centroïdes approximatifs', 1);
select is(
  public.commune_la_plus_proche(14.6928::double precision, -17.4467::double precision),
  'Plateau',
  'le Plateau est nommé « Plateau »'
);

select * from finish();
rollback;
