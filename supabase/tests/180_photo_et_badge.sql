-- La photo de profil, et le badge qui remplace une note qui ne dit rien.
begin;
create extension if not exists pgtap with schema public;

select plan(10);

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
select public.t_utilisateur('Aïda') as conducteur,
       public.t_utilisateur('Modou') as passager;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-PHO-01', 'Toyota Yaris', 'blanche' from f;

-- ============================================================== la photo --
select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  format($$ select public.maj_photo_profil(%L) $$, (select passager from f) || '/profil.jpg'),
  'P0001', 'chemin_etranger',
  'on ne déclare pas la photo de quelqu''un d''autre comme la sienne'
);

select throws_ok(
  $$ select public.maj_photo_profil('profil.jpg') $$,
  'P0001', 'chemin_etranger',
  'un chemin sans dossier n''appartient à personne : refusé'
);

select lives_ok(
  format($$ select public.maj_photo_profil(%L) $$, (select conducteur from f) || '/profil.jpg'),
  'on déclare la sienne'
);

reset role;
select is(
  (select photo_url from public.profiles where id = (select conducteur from f)),
  (select conducteur from f) || '/profil.jpg',
  'c''est le CHEMIN qui est stocké, pas une URL — les URL signées expirent'
);

-- ============================================================== le badge --
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select est_nouveau from public.profils_publics where id = (select conducteur from f)),
  true,
  'sans course terminée, le conducteur est « nouveau »'
);

select is(
  (select courses_comme_conducteur from public.profils_publics
   where id = (select conducteur from f)),
  0,
  'et son compteur de courses au volant est à zéro'
);

-- Cinq courses terminées : le seuil est atteint, le badge tombe.
reset role;
insert into public.ride_requests (
  passager_id, service, depart_lat, depart_lon, depart_libelle,
  destination_lat, destination_lon, destination_libelle, prix_xof, statut, expires_at)
select (select passager from f), 'urbain', 14.6928, -17.4467, 'Colobane',
       14.7167, -17.4677, 'Mermoz', 2000, 'verrouillee', now() + interval '1 hour'
from generate_series(1, 5);

insert into public.offers (
  demande_id, conducteur_id, vehicule_id, type, prix_xof, delai_arrivee_min,
  statut, expires_at)
select d.id, (select conducteur from f),
       (select id from public.vehicles where conducteur_id = (select conducteur from f)),
       'acceptation', 2000, 7, 'acceptee', now() + interval '1 hour'
from public.ride_requests d
where d.passager_id = (select passager from f);

insert into public.rides (
  demande_id, offre_id, passager_id, conducteur_id, vehicule_id,
  prix_convenu_xof, statut, terminee_le)
select o.demande_id, o.id, (select passager from f), (select conducteur from f),
       o.vehicule_id, o.prix_xof, 'terminee', now()
from public.offers o
where o.conducteur_id = (select conducteur from f);

select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select courses_comme_conducteur from public.profils_publics
   where id = (select conducteur from f)),
  5,
  'cinq courses terminées au volant comptent pour cinq'
);

-- LE défaut que cette séparation corrige : le passager de ces cinq courses n'a
-- jamais conduit. Le compter comme expérimenté tromperait exactement la
-- personne que le badge protège.
select is(
  (select courses_comme_conducteur from public.profils_publics
   where id = (select passager from f)),
  0,
  'le passager des cinq courses n''a, lui, conduit zéro fois'
);

select is(
  (select est_nouveau from public.profils_publics where id = (select passager from f)),
  true,
  'et reste « nouveau conducteur » : cinq courses de passager ne sont pas cinq courses au volant'
);

select is(
  (select est_nouveau from public.profils_publics where id = (select conducteur from f)),
  false,
  'au seuil, le badge s''efface et la note reprend sa place'
);

select * from finish();
rollback;
