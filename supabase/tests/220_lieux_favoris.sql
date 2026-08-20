-- Les lieux favoris : à soi, uniques quand il le faut, et jamais bavards.
begin;
create extension if not exists pgtap with schema public;

select plan(12);

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
select public.t_utilisateur('Coumba') as passager,
       public.t_utilisateur('Modou') as conducteur,
       public.t_utilisateur('Astou') as curieux;
grant select on f to authenticated;

select public.t_devenir((select passager from f));
set local role authenticated;

-- ------------------------------------------------------- ce qui s'enregistre --
select lives_ok(
  $$ select public.enregistrer_lieu_favori('domicile', 14.7091, -17.4478, null, 'Immeuble bleu, 3e étage') $$,
  'on enregistre son domicile'
);

select throws_ok(
  $$ select public.enregistrer_lieu_favori('autre', 14.70, -17.44) $$,
  'P0001', 'libelle_requis',
  'un lieu « autre » sans nom ne se retrouve pas : refusé'
);

select is(
  (select libelle from public.lieux_favoris where type = 'domicile'),
  null,
  'le domicile ne stocke PAS son nom : « Domicile » est un mot de l''interface, il se traduit'
);

-- Redéclarer son domicile le DÉPLACE.
select public.enregistrer_lieu_favori('domicile', 14.7300, -17.4600, null, null);

select is(
  (select count(*)::integer from public.lieux_favoris where type = 'domicile'),
  1,
  'redéclarer son domicile le déplace, il n''en crée pas un second'
);

select is(
  (select lat from public.lieux_favoris where type = 'domicile'),
  14.7300::double precision,
  'et c''est bien la nouvelle position'
);

select is(
  (select precision_texte from public.lieux_favoris where type = 'domicile'),
  null,
  'un déplacement sans précision efface l''ancienne : elle décrivait l''ancien lieu'
);

-- Plusieurs « autre », un seul domicile.
select public.enregistrer_lieu_favori('autre', 14.72, -17.47, 'Chez ma sœur');
select public.enregistrer_lieu_favori('autre', 14.75, -17.49, 'Salle de sport');

select is(
  (select count(*)::integer from public.lieux_favoris where type = 'autre'),
  2,
  'les lieux « autre » ne sont pas uniques'
);

-- --------------------------------------------------------------- à soi seul --
select public.t_devenir((select curieux from f));
set local role authenticated;

select is(
  (select count(*)::integer from public.lieux_favoris),
  0,
  'personne d''autre ne voit vos lieux — pas même leur existence'
);

select throws_ok(
  format($$ select public.supprimer_lieu_favori(%L) $$,
         (select id from public.lieux_favoris where type = 'domicile' limit 1)),
  'P0001', 'favori_introuvable',
  'et personne d''autre ne les supprime'
);

-- ------------------------------- le conducteur ne voit RIEN du libellé privé --
-- Une demande posée depuis un favori : c'est l'application qui envoie un libellé
-- neutre. On vérifie ici que la file du conducteur ne porte AUCUNE colonne qui
-- pourrait charrier « Domicile » ou le texte libre.
select public.t_devenir((select passager from f));
set local role authenticated;

select hasnt_column('public', 'demandes_ouvertes', 'depart_libelle',
  'la file conducteur n''expose pas le libellé de départ — un favori y serait nommé');

reset role;
select is(
  (select count(*)::integer
   from information_schema.columns
   where table_schema = 'public'
     and table_name in ('demandes_ouvertes', 'offres_recues')
     and column_name in ('precision_texte', 'libelle')),
  0,
  'ni précision ni libellé de favori dans ce que voit un conducteur'
);

-- ------------------------------------------------------------- le plafond --
select public.t_devenir((select conducteur from f));
set local role authenticated;

do $$
begin
  for i in 1..20 loop
    perform public.enregistrer_lieu_favori('autre', 14.7, -17.4, 'Lieu ' || i);
  end loop;
end $$;

select throws_ok(
  $$ select public.enregistrer_lieu_favori('autre', 14.7, -17.4, 'Le vingt-et-unième') $$,
  'P0001', 'trop_de_favoris',
  'au-delà de vingt ce n''est plus une liste de raccourcis, c''est un annuaire'
);

select * from finish();
rollback;
