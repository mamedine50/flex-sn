-- Flex — ce qu'un visiteur SANS COMPTE peut voir, et ce qu'il ne peut pas.
--
-- Deux moitiés indissociables. La première prouve que la vitrine est ouverte :
-- sans elle, l'écran « Fixez votre prix » est mort pour qui n'a pas de compte,
-- et la règle « on regarde d'abord » n'est qu'une intention. La seconde prouve
-- que rien d'autre ne s'est ouvert avec — c'est elle qui rend la première sûre,
-- et c'est elle qui tombera le jour où un `grant` distrait passera par là.
begin;
select plan(7);

-- --------------------------------------------------------- la vitrine ouverte --
set local role anon;

select isnt_empty(
  'select 1 from public.bornes_prix where service = ''urbain''',
  'anon lit la fourchette urbaine — sans elle l''écran de prix n''affiche rien');

select isnt_empty(
  'select 1 from public.bornes_prix where service = ''interurbain''',
  'anon lit la fourchette interurbaine');

select isnt_empty(
  $$select 1 from public.prix_suggere(
      'urbain'::public.service_course, 14.6928, -17.4467, 14.7167, -17.4677) p
    where p is not null$$,
  'anon obtient un prix suggéré — c''est le chiffre que l''écran propose d''emblée');

-- ------------------------------------------------- et rien d'autre avec elle --
-- Le refus tombe au niveau du GRANT (42501), pas de la RLS : `anon` n'a pas le
-- droit de lire la table du tout. C'est plus fort qu'une politique qui rendrait
-- zéro ligne — une politique se contourne par une faute d'écriture, un droit
-- absent ne se contourne pas. On assère donc l'erreur, pas le vide.
select throws_ok(
  'select 1 from public.profiles',
  '42501',
  null,
  'anon n''a pas le droit de LIRE profiles — refus au grant, pas à la policy');

select throws_ok(
  'select 1 from public.ride_requests',
  '42501',
  null,
  'anon n''a pas le droit de lire ride_requests — même ouverte, une demande porte un point de départ');

select throws_ok(
  $$select public.create_ride_request(
      'urbain'::public.service_course, 14.69, -17.44, 'Plateau',
      14.71, -17.46, 'Medina', 2500)$$,
  '42501',
  null,
  'anon ne peut PAS créer de demande : regarder n''engage personne, proposer si');

reset role;

-- L'inventaire de 010_schema.sql nomme la liste blanche `anon`. Ici on vérifie
-- l'autre bout : qu'elle n'a pas grossi d'une table. Une fonction s'ajoute par
-- distraction, une table s'ajoute par `grant` — les deux portes se ferment
-- séparément.
select is(
  (select coalesce(string_agg(distinct table_name, ', ' order by table_name), '')
   from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee = 'anon'),
  'bornes_prix',
  'anon n''a de droit que sur bornes_prix — la vitrine, et rien de plus');

select * from finish();
rollback;
