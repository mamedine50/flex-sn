-- Ce que le passager voit de ses offres, et ce qu'il peut en faire.
begin;
create extension if not exists pgtap with schema public;

select plan(13);

create function public.t_utilisateur(
  p_prenom text, p_role public.role_utilisateur default 'passager',
  p_nom text default null, p_tel text default null
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles
  set role = p_role, prenom = p_prenom, nom_complet = p_nom, telephone = p_tel,
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
  public.t_utilisateur('Awa', 'passager', 'Awa Ndiaye Diop', '+221771234567') as passager,
  public.t_utilisateur('Fatou') as temoin,
  public.t_utilisateur('Ousmane', 'conducteur', 'Ousmane Sow', '+221781112233') as conducteur;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-6060-FF', 'Kia Picanto', 'grise' from f;

select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467, 'Rue Carnot 12',
                                         14.7220, -17.4900, 'Ouakam', 2500);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select * from public.submit_offer((select id from d), 'contre_offre', 2700, 3::smallint);
set local role postgres;

-- ------------------------------------------------ ce que le passager voit --
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select conducteur_prenom from public.offres_recues where id = (select id from o)),
  'Ousmane',
  'le prénom du conducteur est servi'
);
select is(
  (select vehicule_modele || ' ' || vehicule_couleur from public.offres_recues
   where id = (select id from o)),
  'Kia Picanto grise',
  'le modèle et la couleur aussi'
);
select is(
  (select prix_xof from public.offres_recues where id = (select id from o)),
  2700,
  'le prix de la contre-offre'
);
select is(
  (select delai_arrivee_min from public.offres_recues where id = (select id from o))::int,
  3,
  'le délai d''arrivée'
);
set local role postgres;

-- La plaque et le numéro ne sont NULLE PART dans la vue.
select hasnt_column('public', 'offres_recues', 'plaque',
  'offres_recues ne porte pas la plaque');
select hasnt_column('public', 'offres_recues', 'telephone',
  'offres_recues ne porte pas le téléphone');
select hasnt_column('public', 'offres_recues', 'nom_complet',
  'offres_recues ne porte pas le nom complet');

-- ------------------------------------------------------- un tiers ne voit rien --
select public.t_devenir((select temoin from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.offres_recues $$,
  'un passager étranger ne voit aucune offre'
);
select throws_ok(
  format($$ select public.refuse_offer(%L) $$, (select id from o)),
  'P0001', 'demande_etrangere',
  'et ne peut pas refuser une offre qui ne le concerne pas'
);
set local role postgres;

-- ------------------------------------------------------------------ refuser --
select public.t_devenir((select passager from f));
set local role authenticated;

select is(
  (select statut from public.refuse_offer((select id from o)))::text,
  'refusee',
  'le passager refuse son offre'
);

select throws_ok(
  format($$ select public.refuse_offer(%L) $$, (select id from o)),
  'P0001', 'offre_indisponible',
  'on ne refuse pas deux fois'
);

-- Refuser ne ferme pas la demande : elle continue de recevoir des réponses.
select is(
  (select statut::text from public.ride_requests where id = (select id from d)),
  'ouverte',
  'refuser une offre laisse la demande ouverte'
);

select throws_ok(
  format($$ select public.accept_offer(%L) $$, (select id from o)),
  'P0001', 'offre_indisponible',
  'une offre refusée ne s''accepte plus'
);
set local role postgres;

select * from finish();
rollback;
