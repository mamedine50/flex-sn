-- Flex — « Nouveau conducteur » plutôt qu'une note sur deux avis.
--
-- Une moyenne sur deux évaluations n'est pas une note : c'est du bruit présenté
-- comme un chiffre. Un conducteur malchanceux deux fois affiche 3,0 et ne s'en
-- relève jamais ; un conducteur chanceux deux fois affiche 5,0 et trompe.
--
-- Sous cinq courses terminées, on annonce donc ce qu'on sait vraiment : que la
-- personne est nouvelle.

/** Le seuil sous lequel une moyenne ne veut rien dire. */
create function public.seuil_nouveau_conducteur() returns integer
language sql immutable parallel safe set search_path = ''
as $$ select 5 $$;

revoke all on function public.seuil_nouveau_conducteur() from public, anon;
-- Appelée depuis la vue `profils_publics` : vérifiée contre l'appelant.
grant execute on function public.seuil_nouveau_conducteur() to authenticated;

-- `create or replace` : les colonnes existantes gardent nom, type et ordre, les
-- nouvelles s'ajoutent à la fin — les droits survivent.
create or replace view public.profils_publics
with (security_invoker = false) as
select
  p.id,
  p.prenom,
  p.photo_url,
  p.note_moyenne,
  p.nb_notes,
  p.role,
  -- Le nombre de courses TERMINÉES, tous rôles confondus.
  (
    select count(*)::integer
    from public.rides c
    where c.statut = 'terminee'
      and (c.conducteur_id = p.id or c.passager_id = p.id)
  ) as nombre_courses_terminees,
  -- Ce que l'interface doit afficher : la note, ou le badge. Calculé ICI pour
  -- que les deux écrans qui montrent une note ne puissent pas diverger.
  (
    select count(*)
    from public.rides c
    where c.statut = 'terminee'
      and (c.conducteur_id = p.id or c.passager_id = p.id)
  ) < public.seuil_nouveau_conducteur() as est_nouveau
from public.profiles p;

comment on view public.profils_publics is
  'Projection non confidentielle de profiles. N''y ajouter ni nom_complet ni telephone. `est_nouveau` vaut vrai sous cinq courses terminées : l''interface affiche alors « Nouveau conducteur » au lieu d''une moyenne qui ne veut rien dire.';
