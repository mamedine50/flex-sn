-- Le dossier conducteur : déposer, décider, et ce qu'on voit du dossier d'autrui.
begin;
create extension if not exists pgtap with schema public;

select plan(15);

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
select public.t_utilisateur('Ousmane') as candidat,
       public.t_utilisateur('Fatou') as temoin;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select candidat, 'DK-DOC-01', 'Kia Picanto', 'grise' from f;

-- ================================================================ déposer --
select public.t_devenir((select candidat from f));
set local role authenticated;

select throws_ok(
  format($$ select public.soumettre_document('permis', %L) $$,
         (select temoin from f) || '/permis.jpg'),
  'P0001', 'chemin_etranger',
  'on ne dépose pas un document dans le dossier de quelqu''un d''autre'
);

select is(
  (select statut from public.soumettre_document(
     'piece_identite', (select candidat from f) || '/piece.jpg'))::text,
  'en_attente',
  'une pièce déposée est en attente'
);
select isnt_empty(
  format($$ select 1 from public.soumettre_document('permis', %L) $$,
         (select candidat from f) || '/permis.jpg'),
  'le permis aussi'
);
select isnt_empty(
  format($$ select 1 from public.soumettre_document('carte_grise', %L) $$,
         (select candidat from f) || '/grise.jpg'),
  'la carte grise aussi'
);
select isnt_empty(
  format($$ select 1 from public.soumettre_document('selfie', %L) $$,
         (select candidat from f) || '/selfie.jpg'),
  'le selfie aussi'
);
select isnt_empty(
  format($$ select 1 from public.soumettre_document('photo_vehicule', %L) $$,
         (select candidat from f) || '/vehicule.jpg'),
  'et la photo du véhicule — cinquième pièce du dossier'
);

-- Déposer ne rend PAS conducteur : c'est la validation qui le fait.
select is(public.est_conducteur((select candidat from f)), false,
  'les pièces déposées ne suffisent pas — il faut qu''on les valide');
set local role postgres;

-- ============================================== le dossier reste privé --
select public.t_devenir((select temoin from f));
set local role authenticated;
select is_empty(
  $$ select 1 from public.documents_conducteur $$,
  'personne ne voit les pièces d''identité de personne'
);
set local role postgres;

-- =============================================================== décider --
-- `decider_document()` refuse désormais un appelant qui n'est pas admin. Ces
-- décisions-ci sont celles de `service_role` : on efface donc la revendication
-- JWT posée plus haut, sinon `auth.uid()` reste le candidat.
select set_config('request.jwt.claims', '', true);

select throws_ok(
  format($$ select public.decider_document(%L, 'permis'::public.type_document, false) $$,
         (select candidat from f)),
  'P0001', 'motif_requis',
  'un refus sans motif ne se corrige pas — il est interdit'
);

select is(
  (select motif_refus from public.decider_document(
     (select candidat from f), 'permis'::public.type_document, false, 'Photo illisible')),
  'Photo illisible',
  'un refus porte son motif'
);

-- Redéposer efface le motif : un motif qui survit à la correction accuse de
-- quelque chose de déjà corrigé.
select public.t_devenir((select candidat from f));
set local role authenticated;
select ok(
  (select motif_refus is null from public.soumettre_document(
     'permis', (select candidat from f) || '/permis-2.jpg')),
  'redéposer efface le motif du refus précédent'
);
set local role postgres;
select set_config('request.jwt.claims', '', true);

-- ================================================ les cinq, et alors --
select public.decider_document((select candidat from f), 'piece_identite'::public.type_document, true);
select public.decider_document((select candidat from f), 'permis'::public.type_document, true);
select public.decider_document((select candidat from f), 'carte_grise'::public.type_document, true);
select public.decider_document((select candidat from f), 'selfie'::public.type_document, true);
select is(public.est_conducteur((select candidat from f)), false,
  'quatre pièces sur cinq ne suffisent pas — la photo du véhicule en fait partie');

select public.decider_document((select candidat from f), 'photo_vehicule'::public.type_document, true);
select is(public.est_conducteur((select candidat from f)), true,
  'les cinq validées, et la capacité de conduire s''ouvre');

-- Un refus ultérieur la referme.
select public.decider_document((select candidat from f), 'permis'::public.type_document, false, 'Permis expiré');
select is(public.est_conducteur((select candidat from f)), false,
  'un permis qui expire referme la capacité');

-- ============================================ « Nouveau conducteur » --
select public.t_devenir((select temoin from f));
set local role authenticated;
select is(
  (select est_nouveau from public.profils_publics where id = (select candidat from f)),
  true,
  'sans courses terminées, on est « nouveau » — une moyenne sur deux avis ne dit rien'
);

select * from finish();
rollback;
