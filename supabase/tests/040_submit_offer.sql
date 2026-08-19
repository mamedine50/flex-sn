-- submit_offer() — refus si la demande est expirée ou déjà verrouillée.
begin;
create extension if not exists pgtap with schema public;

select plan(12);

-- Les tests calculent leurs valeurs attendues avec ces utilitaires. Le PRODUIT
-- ne les appelle que depuis des fonctions SECURITY DEFINER, qui n'ont pas besoin
-- du droit ; l'inventaire de 010 vérifie qu'ils restent fermés. Ici, le droit
-- est rendu pour la seule transaction de test, qui sera annulée.
grant execute on function public.arrondir_zone(double precision) to authenticated;
grant execute on function public.taille_cellule_deg() to authenticated;
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

create function public.t_utilisateur(
  p_prenom text,
  p_role public.role_utilisateur default 'passager',
  p_nom text default null,
  p_tel text default null
)
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  -- Le déclencheur `creer_profil_apres_inscription` a DÉJÀ posé la ligne : on la
  -- complète, on ne la recrée pas.
  update public.profiles
  set role = p_role,
      prenom = p_prenom,
      nom_complet = p_nom,
      telephone = p_tel,
      -- Conduire est une capacité : sans documents validés, pas d'offre.
      documents_valides_le = case when p_role = 'conducteur' then now() end
  where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select
  public.t_utilisateur('Awa') as passager,
  public.t_utilisateur('Modou', 'conducteur') as conducteur,
  public.t_utilisateur('Cheikh', 'conducteur') as conducteur_sans_vehicule;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-1234-AA', 'Toyota Corolla', 'blanche' from f;

-- Le passager pose sa demande.
select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467, 'Plateau',
                                         14.7167, -17.4677, 'Ouakam', 2500);
set local role postgres;

-- ------------------------------------------------------ documents non validés --
select public.t_devenir((select passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'documents_non_valides',
  'un compte sans documents validés ne soumet pas d''offre'
);
set local role postgres;

-- --------------------------------------------------------- sans véhicule --
select public.t_devenir((select conducteur_sans_vehicule from f));
set local role authenticated;
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'vehicule_absent',
  'un conducteur sans véhicule actif ne soumet pas d''offre'
);
set local role postgres;

-- ------------------------------------------------------ cohérence des prix --
select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 3000, 4::smallint) $$,
         (select id from d)),
  'P0001', 'prix_incoherent',
  'une acceptation reprend le prix du passager, sinon c''est une contre-offre'
);

select throws_ok(
  format($$ select public.submit_offer(%L, 'contre_offre', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'contre_offre_identique',
  'une contre-offre au même prix n''est pas une contre-offre'
);

select throws_ok(
  format($$ select public.submit_offer(%L, 'contre_offre', 90000, 4::smallint) $$,
         (select id from d)),
  'P0001', 'prix_hors_bornes',
  'une contre-offre hors bornes est refusée'
);

-- ------------------------------------------------------------- cas nominal --
create temp table o as
select * from public.submit_offer((select id from d), 'contre_offre', 3000, 6::smallint);

select is((select statut from o)::text, 'en_attente', 'l''offre naît en attente');
select is((select prix_xof from o), 3000, 'la contre-offre porte son prix');
select ok(
  (select expires_at from o) <= (select expires_at from d),
  'une offre ne survit jamais à sa demande'
);

select throws_ok(
  format($$ select public.submit_offer(%L, 'contre_offre', 3200, 6::smallint) $$,
         (select id from d)),
  'P0001', 'offre_deja_soumise',
  'un conducteur ne répond pas deux fois tant qu''il attend'
);
set local role postgres;

-- ------------------------------------------------------ demande expirée --
update public.ride_requests set expires_at = now() - interval '1 second'
where id = (select id from d);

select public.t_devenir((select conducteur_sans_vehicule from f));
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur_sans_vehicule, 'DK-9876-BB', 'Hyundai Accent', 'grise' from f;
set local role authenticated;
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'demande_expiree',
  'une demande expirée ne reçoit plus d''offre'
);
set local role postgres;

-- --------------------------------------------------- demande verrouillée --
update public.ride_requests
set statut = 'verrouillee', expires_at = now() + interval '5 minutes'
where id = (select id from d);

select public.t_devenir((select conducteur_sans_vehicule from f));
set local role authenticated;
select throws_ok(
  format($$ select public.submit_offer(%L, 'acceptation', 2500, 4::smallint) $$,
         (select id from d)),
  'P0001', 'demande_verrouillee',
  'une demande verrouillée ne reçoit plus d''offre'
);
set local role postgres;

-- L'offre du premier conducteur est toujours là, elle n'a pas été touchée.
select is(
  (select count(*)::int from public.offers where demande_id = (select id from d)),
  1,
  'une seule offre a été enregistrée'
);

select * from finish();
rollback;
