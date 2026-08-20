-- Flex — la photo de profil, et le badge « Nouveau conducteur » là où il compte.
--
-- La photo vit dans `photos-profil`, un dépôt PRIVÉ : on garde le CHEMIN en
-- base, jamais une URL. Une URL signée expire ; un chemin non. Le client signe
-- au moment d'afficher.

create function public.maj_photo_profil(p_chemin text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profil public.profiles;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  -- Même garde que `soumettre_document()` : le chemin est sous SON dossier.
  -- Sans elle, on déclarerait la photo d'un autre comme la sienne, et l'avatar
  -- d'un conducteur deviendrait un champ libre.
  if p_chemin is null or p_chemin !~ ('^' || v_uid::text || '/') then
    raise exception 'chemin_etranger'
      using errcode = 'P0001',
            detail = 'Une photo de profil se dépose dans son propre dossier.';
  end if;

  update public.profiles
  set photo_url = btrim(p_chemin)
  where id = v_uid
  returning * into v_profil;

  return v_profil;
end;
$$;

revoke all on function public.maj_photo_profil(text) from public, anon, authenticated;
grant execute on function public.maj_photo_profil(text) to authenticated;

comment on column public.profiles.photo_url is
  'CHEMIN dans le dépôt `photos-profil`, pas une URL : les URL signées expirent. Écrit uniquement par maj_photo_profil().';

-- ------------------------------------------ un seul calcul du « nouveau » --
-- Deux écrans montrent une note. Tant que le calcul était recopié dans la vue,
-- rien n'empêchait un troisième de le recopier de travers. Il n'existe plus
-- qu'ici.
create function public.courses_terminees(p_profil uuid) returns integer
language sql stable parallel safe set search_path = ''
as $$
  select count(*)::integer
  from public.rides c
  where c.statut = 'terminee'
    and (c.conducteur_id = p_profil or c.passager_id = p_profil)
$$;

create function public.est_nouveau_conducteur(p_profil uuid) returns boolean
language sql stable parallel safe set search_path = ''
as $$
  select public.courses_terminees(p_profil) < public.seuil_nouveau_conducteur()
$$;

-- Appelées depuis des vues : le droit d'exécution est vérifié contre l'appelant,
-- pas contre le propriétaire de la vue. Sans ces grants, les vues cassent à la
-- première ligne servie — et pas avant, ce qui en fait un défaut latent.
revoke all on function public.courses_terminees(uuid) from public, anon;
grant execute on function public.courses_terminees(uuid) to authenticated;
revoke all on function public.est_nouveau_conducteur(uuid) from public, anon;
grant execute on function public.est_nouveau_conducteur(uuid) to authenticated;

create or replace view public.profils_publics
with (security_invoker = false) as
select
  p.id,
  p.prenom,
  p.photo_url,
  p.note_moyenne,
  p.nb_notes,
  p.role,
  public.courses_terminees(p.id) as nombre_courses_terminees,
  public.est_nouveau_conducteur(p.id) as est_nouveau
from public.profiles p;

-- ------------------------------------------------- l'offre porte le badge --
-- Le passager choisit sur cette liste. Lui servir « 5,0 » sur deux avis, c'est
-- lui faire croire à une régularité qui n'a pas été mesurée.
create or replace view public.offres_recues
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
  public.courses_terminees(p.id) as conducteur_nb_courses
from public.offers o
join public.ride_requests d on d.id = o.demande_id
join public.profiles p on p.id = o.conducteur_id
join public.vehicles v on v.id = o.vehicule_id
where d.passager_id = (select auth.uid());

comment on view public.offres_recues is
  'Offres reçues par le passager. Ni téléphone ni plaque : ils arrivent avec la course, par les tables. `conducteur_est_nouveau` remplace la note sous cinq courses.';
