-- Le prix suggéré : crédible quand le tarif existe, NULL quand il n'existe pas.
--
-- Le cas qui compte est le second. Tant que les tarifs réels de Dakar ne sont pas
-- renseignés, la fonction doit rendre NULL — et l'écran ouvre un champ vide. Un
-- chiffre inventé présenté comme une suggestion enverrait le passager dans le mur.
begin;
create extension if not exists pgtap with schema public;

select plan(8);

-- Plateau → Ouakam, environ 6 km à vol d'oiseau.
create temp table trajet as
select 14.6928::double precision as d_lat, -17.4467::double precision as d_lon,
       14.7220::double precision as a_lat, -17.4900::double precision as a_lon;

-- --------------------------------------------- tarif absent : aucune suggestion --
select ok(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) is null from trajet),
  'sans tarif renseigné, aucune suggestion — le champ restera vide'
);

select is(
  (select count(*)::int from public.bornes_prix
   where prix_base_xof is not null or prix_km_xof is not null),
  0,
  'aucun tarif n''est renseigné à la livraison — on n''invente pas de chiffres'
);

-- ------------------------------------------------ tarif renseigné : suggestion --
update public.bornes_prix set prix_base_xof = 700, prix_km_xof = 250 where service = 'urbain';

create temp table suggestion as
select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) as prix from trajet;

select ok((select prix from suggestion) is not null, 'avec un tarif, une suggestion sort');

select is(
  (select prix % 100 from suggestion), 0,
  'la suggestion est un multiple de 100 — le pas réel de la monnaie'
);

select ok(
  (select prix from suggestion) between 1500 and 2600,
  'une course Plateau → Ouakam suggère un prix plausible pour 6 km'
);

-- ------------------------------------------------------ les bornes l'emportent --
-- Un tarif délirant ne doit pas produire une suggestion que le serveur refusera
-- juste après : `create_ride_request()` appliquerait les mêmes bornes.
update public.bornes_prix set prix_base_xof = 900000, prix_km_xof = 900000 where service = 'urbain';
select is(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) from trajet),
  (select max_xof from public.bornes_prix where service = 'urbain'),
  'une suggestion trop haute est ramenée à la borne haute'
);

update public.bornes_prix set prix_base_xof = 100, prix_km_xof = 1 where service = 'urbain';
select is(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) from trajet),
  (select min_xof from public.bornes_prix where service = 'urbain'),
  'une suggestion trop basse est remontée à la borne basse'
);

-- Un aller-retour identique suggère le même prix : la fonction ne dépend que de
-- la distance, pas du sens.
update public.bornes_prix set prix_base_xof = 700, prix_km_xof = 250 where service = 'urbain';
select is(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) from trajet),
  (select public.prix_suggere('urbain', a_lat, a_lon, d_lat, d_lon) from trajet),
  'le prix suggéré est le même dans les deux sens'
);

select * from finish();
rollback;
