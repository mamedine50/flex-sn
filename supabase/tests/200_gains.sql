-- Les gains : ceux du conducteur courant, et de personne d'autre.
begin;
create extension if not exists pgtap with schema public;

select plan(4);

create function public.t_utilisateur(p_prenom text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles set prenom = p_prenom where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select public.t_utilisateur('Ndèye') as conducteur,
       public.t_utilisateur('Ibrahima') as autre,
       public.t_utilisateur('Sokhna') as passager;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-GAI-01', 'Hyundai i10', 'bleue' from f;

insert into public.ride_requests (
  passager_id, service, depart_lat, depart_lon, depart_libelle,
  destination_lat, destination_lon, destination_libelle, prix_xof, statut, expires_at)
select (select passager from f), 'urbain', 14.7091, -17.4478, 'Colobane',
       14.7074, -17.4744, 'Mermoz', 2000, 'verrouillee', now() + interval '1 hour'
from generate_series(1, 3);

insert into public.offers (
  demande_id, conducteur_id, vehicule_id, type, prix_xof, delai_arrivee_min,
  statut, expires_at)
select d.id, (select conducteur from f),
       (select id from public.vehicles where conducteur_id = (select conducteur from f)),
       'acceptation', 2500, 6, 'acceptee', now() + interval '1 hour'
from public.ride_requests d
where d.passager_id = (select passager from f);

insert into public.rides (
  demande_id, offre_id, passager_id, conducteur_id, vehicule_id,
  prix_convenu_xof, statut, terminee_le)
select o.demande_id, o.id, (select passager from f), (select conducteur from f),
       o.vehicule_id, o.prix_xof, 'terminee', now()
from public.offers o
where o.conducteur_id = (select conducteur from f);

select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(
  (select courses from public.mes_gains),
  3,
  'trois courses terminées comptent pour trois'
);

select is(
  (select total_xof from public.mes_gains),
  7500::bigint,
  'et 3 × 2 500 font 7 500 FCFA — la somme est en entier XOF, jamais en flottant'
);

-- Un autre conducteur ne voit RIEN de ces gains : le filtre est dans la vue.
select public.t_devenir((select autre from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.mes_gains),
  0,
  'un autre conducteur ne lit pas les gains du premier'
);

-- Et le passager de ces courses non plus, alors qu'il en connaît le prix.
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.mes_gains),
  0,
  'le passager non plus, même s''il a payé ces courses'
);

select * from finish();
rollback;
