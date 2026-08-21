-- La course après acceptation : le cycle, la plaque, l'annulation, la notation.
begin;
create extension if not exists pgtap with schema public;

select plan(28);

grant execute on function public.duree_demande(public.service_course) to authenticated;

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
  public.t_utilisateur('Ousmane', 'conducteur', 'Ousmane Sow', '+221781112233') as conducteur,
  public.t_utilisateur('Fatou') as temoin;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-ROUTE-1', 'Kia Picanto', 'grise' from f;

select public.t_devenir((select passager from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.6928, -17.4467,
  'Devant la pharmacie, Plateau', 14.7220, -17.4900, 'Ouakam', 2500);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
create temp table o as
select * from public.submit_offer((select id from d), 'acceptation', 2500, 4::smallint);
set local role postgres;

select public.t_devenir((select passager from f));
set local role authenticated;
create temp table c as select * from public.accept_offer((select id from o));
set local role postgres;

-- ======================================================== 1 · la plaque --
-- Servie sur la course active de l'appelant, dans les DEUX sens.
select public.t_devenir((select passager from f));
set local role authenticated;
select is(
  (select plaque from public.vehicles where conducteur_id = (select conducteur from f)),
  'DK-ROUTE-1',
  'le passager lit la plaque de SA course — c''est ainsi qu''il monte dans la bonne voiture'
);
select hasnt_column('public', 'vehicules_publics', 'plaque',
  'la plaque n''est nulle part dans la vue publique des véhicules');
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select is(
  (select plaque from public.vehicles where conducteur_id = (select conducteur from f)),
  'DK-ROUTE-1',
  'le conducteur lit la sienne'
);
set local role postgres;

-- Un tiers ne voit ni la plaque, ni le numéro, ni le nom.
select public.t_devenir((select temoin from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.vehicles $$,
  'un tiers ne voit aucune plaque'
);
select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select passager from f)),
  'ni le profil du passager'
);
set local role postgres;

-- ==================================================== 2 · le cycle de vie --
select public.t_devenir((select passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.avancer_course(%L, 'en_route') $$, (select id from c)),
  'P0001', 'course_etrangere',
  'le passager ne pilote pas la course'
);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;

select throws_ok(
  format($$ select public.avancer_course(%L, 'commencee') $$, (select id from c)),
  'P0001', 'etape_invalide',
  'on ne saute pas une étape — le passager attend de voir chaque moment passer'
);

select is((select statut from public.avancer_course((select id from c), 'en_route'))::text,
  'en_route', 'le conducteur part');
select is((select statut from public.avancer_course((select id from c), 'arrive'))::text,
  'arrive', 'il arrive');
select is((select statut from public.avancer_course((select id from c), 'commencee'))::text,
  'commencee', 'la course commence');
set local role postgres;

-- ============================================== 3 · annuler, et pas après --
select public.t_devenir((select passager from f));
set local role authenticated;
select throws_ok(
  format($$ select public.annuler_course(%L) $$, (select id from c)),
  'P0001', 'course_commencee',
  'une course commencée ne s''annule pas, elle se termine'
);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select is((select statut from public.avancer_course((select id from c), 'terminee'))::text,
  'terminee', 'le conducteur termine');
select ok(
  (select terminee_le is not null from public.rides where id = (select id from c)),
  'l''heure de fin est posée'
);
set local role postgres;

-- La plaque disparaît une fois la course terminée.
select public.t_devenir((select passager from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.vehicles $$,
  'course terminée : le passager ne garde pas la plaque'
);
select is_empty(
  format($$ select 1 from public.profiles where id = %L $$, (select conducteur from f)),
  'ni le numéro du conducteur'
);

-- ================================================ 4 · le double aveugle --
select is(
  (select note from public.noter_course((select id from c), 5::smallint, 'Ponctuel')),
  5::smallint,
  'le passager note'
);

-- Sa note à lui est visible ; celle qu'il a reçue ne l'est pas encore.
select is(
  (select count(*)::int from public.evaluations),
  1,
  'il voit sa propre évaluation'
);
-- `evaluations_visibles` est INTERNE depuis 20260820230000 : le client la lit
-- par `mes_evaluations`, qui ne rend que ses propres avis reçus.
select is_empty(
  $$ select 1 from public.mes_evaluations $$,
  'rien n''est dévoilé tant que l''autre n''a pas noté'
);

select throws_ok(
  $$ select 1 from public.evaluations_visibles $$,
  '42501',
  null,
  'et la vue interne n''est plus lisible par un compte connecté'
);
select is(
  (select note_moyenne from public.profils_publics
   where id = (select conducteur from f)),
  null,
  'et la moyenne du conducteur ne bouge pas'
);

select throws_ok(
  format($$ select public.noter_course(%L, 4::smallint) $$, (select id from c)),
  'P0001', 'deja_note',
  'on ne note qu''une fois'
);
set local role postgres;

select public.t_devenir((select conducteur from f));
set local role authenticated;
select is(
  (select note from public.noter_course((select id from c), 4::smallint)),
  4::smallint,
  'le conducteur note à son tour'
);
set local role postgres;

-- Les deux ont noté : tout se dévoile d'un coup.
select is(
  (select count(*)::int from public.evaluations_visibles),
  2,
  'les deux évaluations se dévoilent ensemble'
);
select is(
  (select note_moyenne from public.profiles where id = (select conducteur from f)),
  5.0,
  'la moyenne du conducteur intègre la note du passager'
);
select is(
  (select note_moyenne from public.profiles where id = (select passager from f)),
  4.0,
  'et réciproquement'
);

-- ========================================= 5 · la publication différée --
-- L'un ne note jamais : sept jours plus tard, la note de l'autre se publie.
delete from public.evaluations where auteur_id = (select conducteur from f);
update public.profiles set note_moyenne = null, nb_notes = 0;
-- Sept jours et une minute : `publier_evaluations()` ne regarde qu'une fenêtre
-- de deux heures, pour ne pas recalculer tout l'historique à chaque passage.
update public.rides set terminee_le = now() - interval '7 days 1 minute'
 where id = (select id from c);

select is(
  (select count(*)::int from public.evaluations_visibles),
  1,
  'après sept jours, la note isolée se dévoile'
);

select is(public.publier_evaluations(), 1, 'la tâche planifiée en publie une');
select is(
  (select note_moyenne from public.profiles where id = (select conducteur from f)),
  5.0,
  'et la moyenne se met à jour sans que l''autre ait noté'
);

select * from finish();
rollback;
