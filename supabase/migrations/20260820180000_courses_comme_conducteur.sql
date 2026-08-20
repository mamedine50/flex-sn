-- Flex — le badge « Nouveau conducteur » compte les courses AU VOLANT.
--
-- Défaut de raisonnement corrigé ici : `courses_terminees()` comptait les
-- courses tous rôles confondus. Un passager fidèle qui devient conducteur
-- passait donc le seuil sans avoir jamais conduit — et paraissait expérimenté
-- exactement devant la personne que le badge est censé protéger.
--
-- `note_moyenne`, elle, reste tous rôles : elle mesure la personne, pas le
-- métier. C'est la seule chose qu'on sait vraiment d'un nouveau conducteur qui
-- a déjà cinquante courses de passager derrière lui.
create function public.courses_comme_conducteur(p_profil uuid) returns integer
language sql stable parallel safe set search_path = ''
as $$
  select count(*)::integer
  from public.rides c
  where c.statut = 'terminee' and c.conducteur_id = p_profil
$$;

-- Appelée depuis des vues : le droit est vérifié contre l'appelant, pas contre
-- le propriétaire. Sans ce grant, la vue casse à la première ligne servie — et
-- pas avant, ce qui en fait un défaut latent.
revoke all on function public.courses_comme_conducteur(uuid) from public, anon;
grant execute on function public.courses_comme_conducteur(uuid) to authenticated;

create or replace function public.est_nouveau_conducteur(p_profil uuid)
returns boolean
language sql stable parallel safe set search_path = ''
as $$
  select public.courses_comme_conducteur(p_profil)
       < public.seuil_nouveau_conducteur()
$$;

comment on function public.est_nouveau_conducteur(uuid) is
  'Vrai sous cinq courses TERMINÉES AU VOLANT. Ne pas y remettre les courses de passager : le badge protège le passager d''un conducteur qu''il ne connaît pas, pas d''un inconnu tout court.';

-- `drop` + `create` plutôt que `create or replace` : la colonne
-- `nombre_courses_terminees` comptait les deux rôles, et la garder « au cas où »
-- laisserait le prochain écran s'en servir pour la ligne « ★ 4,8 · 127 courses ».
-- Une colonne trompeuse qui traîne est un défaut en attente.
--
-- Qui dit drop dit RE-GRANT. C'est le piège de la manœuvre, et il ne se voit
-- qu'en interrogeant la vue avec un rôle qui n'est pas le propriétaire.
drop view public.profils_publics;

create view public.profils_publics
with (security_invoker = false) as
select
  p.id,
  p.prenom,
  p.photo_url,
  p.note_moyenne,
  p.nb_notes,
  p.role,
  -- Le seul compteur servi : celui du volant. C'est lui que le passager lit à
  -- côté de la note, et lui qui fait tomber le badge.
  public.courses_comme_conducteur(p.id) as courses_comme_conducteur,
  public.est_nouveau_conducteur(p.id) as est_nouveau
from public.profiles p;

revoke all on public.profils_publics from anon, authenticated;
grant select on public.profils_publics to authenticated;

comment on view public.profils_publics is
  'Projection non confidentielle de profiles. N''y ajouter ni nom_complet ni telephone. `courses_comme_conducteur` compte les courses AU VOLANT — la note, elle, agrège les deux rôles.';

drop view public.offres_recues;

create view public.offres_recues
with (security_invoker = false) as
select
  o.id,
  o.demande_id,
  o.type,
  o.prix_xof,
  o.delai_arrivee_min,
  o.statut,
  o.expires_at,
  o.cree_le,
  o.conducteur_id,
  p.prenom as conducteur_prenom,
  p.photo_url as conducteur_photo,
  p.note_moyenne as conducteur_note,
  p.nb_notes as conducteur_nb_notes,
  v.modele as vehicule_modele,
  v.couleur as vehicule_couleur,
  public.est_nouveau_conducteur(p.id) as conducteur_est_nouveau,
  public.courses_comme_conducteur(p.id) as conducteur_nb_courses
from public.offers o
join public.ride_requests d on d.id = o.demande_id
join public.profiles p on p.id = o.conducteur_id
join public.vehicles v on v.id = o.vehicule_id
where d.passager_id = (select auth.uid());

revoke all on public.offres_recues from anon, authenticated;
grant select on public.offres_recues to authenticated;

comment on view public.offres_recues is
  'Offres reçues par le passager. Ni téléphone ni plaque : ils arrivent avec la course, par les tables. `conducteur_est_nouveau` remplace la note sous cinq courses AU VOLANT.';

-- `courses_terminees()` ne sert plus rien. On la laisse : la retirer imposerait
-- de la recréer le jour où une page « mes courses » comptera les deux rôles, et
-- son commentaire dit maintenant à quoi elle NE sert pas.
comment on function public.courses_terminees(uuid) is
  'Courses terminées TOUS RÔLES confondus. N''est PAS ce qu''il faut pour le badge « Nouveau conducteur » — voir courses_comme_conducteur().';
