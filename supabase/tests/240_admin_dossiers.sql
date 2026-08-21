-- L'administration des dossiers : qui décide, qui ne décide pas, et qui voit quoi.
begin;
create extension if not exists pgtap with schema public;

select plan(11);

create function public.t_utilisateur(p_prenom text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles set prenom = p_prenom, nom_complet = p_prenom || ' Diop',
         telephone = '+2217' || lpad((random() * 99999999)::bigint::text, 8, '0')
   where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select public.t_utilisateur('Amina') as admin,
       public.t_utilisateur('Ousmane') as candidat,
       public.t_utilisateur('Modou') as conducteur;
grant select on f to authenticated;

-- Le drapeau se pose à la main, par service_role. Aucune RPC ne le fait.
update public.profiles set est_admin = true where id = (select admin from f);

-- Le candidat dépose ses quatre pièces.
insert into public.documents_conducteur (profil_id, type, chemin)
select candidat, t, candidat || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select candidat, 'DK-ADM-01', 'Kia Picanto', 'grise' from f;

-- Un conducteur déjà validé, pour prouver qu'être conducteur n'est pas être admin.
insert into public.documents_conducteur (profil_id, type, chemin)
select conducteur, t, conducteur || '/' || t || '.jpg'
from f, unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;
insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-ADM-02', 'Toyota Yaris', 'blanche' from f;
select set_config('request.jwt.claims', '', true);
select public.decider_document((select conducteur from f), t, true)
from unnest(array['piece_identite','permis','carte_grise','selfie']::public.type_document[]) t;

-- ─────────────────────────────────────── le drapeau ne s'attrape pas ──────
select public.t_devenir((select candidat from f));
set local role authenticated;

select is(public.est_admin(), false, 'un candidat n''est pas administrateur');

select throws_ok(
  format($$ update public.profiles set est_admin = true where id = %L $$,
         (select candidat from f)),
  '42501', null,
  'et il ne peut pas se l''attribuer : aucune écriture sur profiles'
);

select is_empty(
  $$ select 1 from public.dossiers_en_attente $$,
  'il ne voit aucune file — la vue filtre sur est_admin(), pas le client'
);

select is(
  (select count(*)::integer from public.dossier_du_candidat((select candidat from f))),
  0,
  'et il ne lit pas son dossier par la fonction d''administration'
);

select is(
  (select count(*)::integer from public.documents_conducteur),
  4,
  'en revanche il voit SON propre dossier, par la table — quatre pièces'
);

-- ──────────────────────────── un conducteur validé n'est pas un admin ─────
reset role;
select public.t_devenir((select conducteur from f));
set local role authenticated;

select is(public.est_conducteur((select conducteur from f)), true,
  'ce conducteur est bien validé');

select throws_ok(
  format($$ select public.decider_document(%L, 'permis'::public.type_document, true) $$,
         (select candidat from f)),
  'P0001', 'reserve_admin',
  'être conducteur ne donne AUCUN droit sur le dossier d''un autre'
);

-- ────────────────────────────────────────────────── l'admin, lui, peut ────
reset role;
select public.t_devenir((select admin from f));
set local role authenticated;

select is(
  (select pieces_en_attente from public.dossiers_en_attente
   where profil_id = (select candidat from f)),
  4::bigint,
  'l''admin voit le dossier en attente, avec ses quatre pièces'
);

select throws_ok(
  format($$ select public.decider_document(%L, 'permis'::public.type_document, false) $$,
         (select candidat from f)),
  'P0001', 'motif_requis',
  'même pour un admin, un refus sans motif est refusé'
);

select lives_ok(
  format($$ select public.decider_document(%L, 'permis'::public.type_document, false, 'Photo illisible') $$,
         (select candidat from f)),
  'l''admin refuse une pièce, avec motif'
);

-- ──────────────────────────────────────────────────────── le journal ──────
reset role;
select is(
  (select decide_par from public.decisions_documents
    where profil_id = (select candidat from f) and type = 'permis'),
  (select admin from f),
  'le journal garde QUI a décidé — sans quoi une contestation est indéfendable'
);

select * from finish();
rollback;
