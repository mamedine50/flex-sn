-- La tarification recommandée : repères publics, routage, journaux.
begin;
create extension if not exists pgtap with schema public;

select plan(20);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

create function public.t_utilisateur(
  p_prenom text, p_role public.role_utilisateur default 'passager'
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles
  set role = p_role, prenom = p_prenom,
      documents_valides_le = case when p_role = 'conducteur' then now() end
  where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

-- =================================== 1 · les trois repères publics de Dakar --
-- Coordonnées réelles. Si la formule sort de ces fourchettes, on ajuste
-- `prix_km_xof` — pas ces bornes, qui viennent de ce que les gens paient.
create temp table plateau as
select 14.6690::double precision as lat, -17.4380::double precision as lon;

select ok(
  (select public.prix_suggere('urbain', lat, lon, 14.6900, -17.4630) from plateau)
    between 1000 and 1500,
  'Plateau → Point E tombe entre 1 000 et 1 500 F'
);
select ok(
  (select public.prix_suggere('urbain', lat, lon, 14.7100, -17.4950) from plateau)
    between 1500 and 2000,
  'Plateau → Mamelles tombe entre 1 500 et 2 000 F'
);
select ok(
  (select public.prix_suggere('urbain', lat, lon, 14.7480, -17.5130) from plateau)
    between 2000 and 3000,
  'Plateau → Almadies/Ngor tombe entre 2 000 et 3 000 F'
);

-- La recommandation est un MINIMUM : elle ne descend jamais sous la borne basse.
select ok(
  (select public.prix_suggere('urbain', lat, lon, lat, lon) from plateau)
    >= (select min_xof from public.bornes_prix where service = 'urbain'),
  'même à distance nulle, la recommandation reste au-dessus de la borne basse'
);
select is(
  (select public.prix_suggere('urbain', lat, lon, 14.6900, -17.4630) % 100 from plateau),
  0,
  'la recommandation est un multiple de 100'
);

-- Le facteur de détour agit : sans lui la recommandation serait plus basse.
select ok(
  (select public.prix_suggere('urbain', lat, lon, 14.7480, -17.5130) from plateau)
    > (select b.prix_base_xof
            + round(extensions.st_distance(
                extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography,
                extensions.st_setsrid(extensions.st_makepoint(-17.5130, 14.7480), 4326)::extensions.geography
              ) / 1000.0 * b.prix_km_xof)
       from public.bornes_prix b, plateau where b.service = 'urbain'),
  'le facteur de détour relève la recommandation au-dessus du vol d''oiseau nu'
);

-- ======================= 2 · l'interurbain ne se calcule pas au kilomètre --
-- Reporté à après la V1 : le prix y est un usage, pas un calcul. La formule
-- urbaine tomberait SOUS le prix d'une place de sept-places, et le passager
-- n'aurait aucune réponse sans comprendre pourquoi. On rend NULL, l'écran
-- s'ouvre vide, et c'est honnête.
select ok(
  (select public.prix_suggere('interurbain', lat, lon, 14.7910, -16.9260) from plateau)
    is null,
  'Dakar → Thiès ne rend aucune recommandation'
);
select ok(
  (select public.prix_suggere('interurbain', lat, lon, 14.8500, -15.8800) from plateau)
    is null,
  'Dakar → Touba non plus'
);

-- Le NULL est une DÉCISION de routage, pas un tarif manquant : les colonnes de
-- l'interurbain sont renseignées, et il rend NULL quand même.
select ok(
  (select prix_base_xof is not null and prix_km_xof is not null
   from public.bornes_prix where service = 'interurbain'),
  'le tarif interurbain existe en base — le NULL ne vient pas de son absence'
);

-- ===================================================== 3 · le re-grant survit --
-- La signature de create_ride_request a changé : drop + create. C'est là qu'on
-- oublie le grant, et ça ne se voit qu'en production.
select ok(
  has_function_privilege('authenticated',
    'public.create_ride_request(public.service_course, double precision, double precision, text, double precision, double precision, text, integer, integer)',
    'execute'),
  'create_ride_request reste exécutable par authenticated après le drop + create'
);

-- ============================================================ 4 · le journal --
create temp table f as
select public.t_utilisateur('Awa') as passager,
       public.t_utilisateur('Modou', 'conducteur') as conducteur;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-TARIF-1', 'Kia Picanto', 'grise' from f;

select public.t_devenir((select passager from f));
set local role authenticated;

-- Le passager a modifié le pré-rempli : 2 100 recommandé, 2 500 proposé.
create temp table d as
select * from public.create_ride_request('urbain', 14.6690, -17.4380, 'Plateau',
                                         14.7480, -17.5130, 'Ngor', 2500, 2100);

-- Le client ne voit RIEN du journal, alors qu'il vient de l'écrire.
select throws_ok(
  $$ select 1 from public.events_prix $$,
  42501,
  null,
  'le client ne lit pas events_prix, même la ligne qu''il vient de provoquer'
);
select throws_ok(
  $$ insert into public.events_prix (demande_id, service, prix_propose_xof, prix_modifie,
       maille_depart_lat, maille_depart_lon, maille_arrivee_lat, maille_arrivee_lon, distance_m)
     values (gen_random_uuid(), 'urbain', 2500, true, 14.6, -17.4, 14.7, -17.5, 1000) $$,
  42501,
  null,
  'et il ne peut rien y écrire'
);
set local role postgres;

select is(
  (select recommandation_xof from public.events_prix where demande_id = (select id from d)),
  2100,
  'la recommandation affichée est journalisée'
);
select is(
  (select prix_modifie from public.events_prix where demande_id = (select id from d)),
  true,
  'un prix différent du pré-rempli est marqué modifié'
);
select ok(
  (select distance_m from public.events_prix where demande_id = (select id from d))
    between 10000 and 14000,
  'la distance est journalisée en mètres'
);

-- Aucune position exacte dans le journal : que des mailles.
select is(
  (select maille_depart_lat from public.events_prix where demande_id = (select id from d)),
  public.arrondir_zone(14.6690::double precision),
  'le journal ne garde que la maille, jamais le point exact'
);

-- ------------------------------------------ complété par la négociation --
select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select * from public.submit_offer((select id from d), 'contre_offre', 2700, 4::smallint);
set local role postgres;

select is(
  (select nb_contre_offres from public.events_prix where demande_id = (select id from d)),
  1,
  'la contre-offre est comptée'
);

select public.t_devenir((select passager from f));
set local role authenticated;
create temp table c as select * from public.accept_offer((select id from o));
set local role postgres;

select is(
  (select prix_convenu_xof from public.events_prix where demande_id = (select id from d)),
  2700,
  'le prix réellement convenu est journalisé — c''est lui qui dit la valeur'
);

-- =========================================== 5 · le garde-fou anti-boucle --
-- Une demande dont le prix N'A PAS été modifié ne doit pas entrer dans le
-- centile : elle ne ferait que renvoyer notre propre recommandation.
update public.events_prix
set prix_modifie = false, prix_convenu_xof = 99900
where demande_id = (select id from d);

select ok(
  (select p25_prix_convenu_xof from public.stats_routes
   where maille_depart_lat = public.arrondir_zone(14.6690::double precision)) is null,
  'un prix non modifié est exclu du centile — une recommandation n''apprend pas de son propre écho'
);
select is(
  (select nb_demandes from public.stats_routes
   where maille_depart_lat = public.arrondir_zone(14.6690::double precision)),
  1,
  'mais la demande reste comptée dans le volume'
);

select * from finish();
rollback;
