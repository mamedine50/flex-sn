-- Flex — l'identité du candidat, indépendamment de la file d'attente.
--
-- LE DÉFAUT. L'écran d'un dossier lisait le nom, la photo et le véhicule dans
-- `dossiers_en_attente`. Or cette vue ne garde QUE les dossiers ayant encore une
-- pièce à trancher : à la seconde où l'admin décide la dernière, le candidat
-- disparaît de la file — et l'écran qu'il est en train de regarder perd le nom
-- (« 's file »), la photo de profil, et affiche « aucun véhicule déclaré »
-- alors que le véhicule est là.
--
-- Trois symptômes, une cause : une page de DÉTAIL n'a pas à dépendre d'une
-- LISTE dont l'objet est de se vider.
create view public.candidat_admin
with (security_invoker = false) as
  select
    p.id as profil_id,
    p.prenom,
    p.nom_complet,
    p.telephone,
    p.photo_url,
    p.documents_valides_le,
    public.est_conducteur(p.id) as est_conducteur,
    v.plaque,
    v.modele,
    v.couleur
  from public.profiles p
  left join public.vehicles v on v.conducteur_id = p.id and v.actif
  where public.est_admin();

revoke all on public.candidat_admin from public, anon, authenticated;
grant select on public.candidat_admin to authenticated;

comment on view public.candidat_admin is
  'Le candidat vu par l''administration : identité, véhicule, et si sa capacité est ouverte. Ne dépend PAS de la file d''attente — celle-ci se vide par construction dès que tout est décidé, et la page de détail perdait alors son nom et son véhicule.';
