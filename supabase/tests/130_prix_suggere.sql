-- Le prix suggéré : crédible quand le tarif existe, NULL quand il n'existe pas.
--
-- Le cas qui compte est le second. Tant que les tarifs réels de Dakar ne sont pas
-- renseignés, la fonction doit rendre NULL — et l'écran ouvre un champ vide. Un
-- chiffre inventé présenté comme une suggestion enverrait le passager dans le mur.
begin;
create extension if not exists pgtap with schema public;

select plan(9);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

-- Plateau → Ouakam, environ 6 km à vol d'oiseau.
create temp table trajet as
select 14.6928::double precision as d_lat, -17.4467::double precision as d_lon,
       14.7220::double precision as a_lat, -17.4900::double precision as a_lon;

-- ------------------------------------ le repli quand le tarif n'est pas posé --
-- On le vérifie en le retirant : c'est le comportement qui compte le jour où on
-- ajoutera un service sans tarif.
update public.bornes_prix set prix_base_xof = null, prix_km_xof = null
 where service = 'urbain';
select ok(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) is null from trajet),
  'sans tarif renseigné, aucune suggestion — le champ reste vide'
);

-- ------------------------------------------------ tarif renseigné : suggestion --
update public.bornes_prix set prix_base_xof = 500, prix_km_xof = 150 where service = 'urbain';

select is(
  (select count(*)::int from public.bornes_prix
   where prix_base_xof is null or prix_km_xof is null),
  0,
  'les deux services ont un tarif de référence'
);

create temp table suggestion as
select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) as prix from trajet;

select ok((select prix from suggestion) is not null, 'avec un tarif, une suggestion sort');

select is(
  (select prix % 100 from suggestion), 0,
  'la suggestion est un multiple de 100 — le pas réel de la monnaie'
);

select ok(
  (select prix from suggestion) between 1000 and 3000,
  'une course Plateau → Ouakam suggère un prix plausible'
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
update public.bornes_prix set prix_base_xof = 500, prix_km_xof = 150 where service = 'urbain';
select is(
  (select public.prix_suggere('urbain', d_lat, d_lon, a_lat, a_lon) from trajet),
  (select public.prix_suggere('urbain', a_lat, a_lon, d_lat, d_lon) from trajet),
  'le prix suggéré est le même dans les deux sens'
);

-- ------------------------------------------------------------------ dette --
-- Les tarifs posés par 20260819220000 sont une ESTIMATION. Ils n'ont pas été
-- vérifiés auprès de conducteurs dakarois, et l'écart ci-dessous le montre : la
-- valeur attendue est celle d'une course réelle Ouakam → Plateau, la valeur
-- obtenue vient d'une distance à VOL D'OISEAU (≈ 8 km contre ≈ 11 km par la
-- route). Le tarif au kilomètre doit absorber ce facteur d'environ 1,3.
--
-- Ce bloc passera au vert le jour où les tarifs seront confirmés sur le terrain
-- et recalibrés. Il ne fait pas tomber la CI, il reste visible.
select todo('tarifs non vérifiés auprès de conducteurs dakarois', 1);
select is(
  public.prix_suggere('urbain', 14.7220::double precision, -17.4900::double precision,
                                14.6690::double precision, -17.4380::double precision),
  2150,
  'Ouakam → Plateau suggère le prix d''un taxi dakarois réel'
);

select * from finish();
rollback;
