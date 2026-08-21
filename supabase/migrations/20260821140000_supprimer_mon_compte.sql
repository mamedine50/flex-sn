-- Flex — supprimer son compte, depuis l'application.
--
-- Exigence de l'App Store depuis 2022 (règle 5.1.1(v)) : toute application qui
-- permet de CRÉER un compte doit permettre de le supprimer depuis l'application.
-- Une adresse d'assistance ne vaut pas suppression.
--
-- ============================================================ CE QUI DISPARAÎT
-- Tout ce qui n'appartient qu'à la personne : lieux favoris, pièces du dossier
-- conducteur, véhicule, position, blocages, et les évaluations REÇUES — la
-- réputation d'un compte qui n'existe plus n'a aucune raison de survivre.
--
-- ==================================== LES FICHIERS NE PARTENT PAS D'ICI
-- Supabase interdit le `delete` direct dans `storage.objects` par un déclencheur,
-- y compris au propriétaire de la base : il n'y a pas de chemin SQL vers les
-- fichiers. C'est donc le CLIENT qui les efface par l'API de stockage, avant
-- d'appeler cette fonction.
--
-- D'où `suppression_possible()`, qui existe pour une seule raison : sans elle, on
-- effacerait les pièces d'identité AVANT de découvrir qu'une course active
-- interdit la suppression. La personne aurait perdu son dossier pour rien.
-- L'ordre est donc : demander, effacer les fichiers, supprimer.
--
-- ========================================================== CE QUI RESTE, ET POURQUOI
-- Une course appartient à DEUX personnes. L'effacer priverait la contrepartie de
-- son historique et de ses gains : ce serait supprimer les données de quelqu'un
-- d'autre. Les courses restent donc, et la ligne de `profiles` avec elles — mais
-- VIDÉE. Prénom remplacé, nom, téléphone et photo à `null`, note remise à zéro.
-- Le conducteur d'hier voit « Compte supprimé » à la place d'un nom, et c'est
-- exactement ce qu'il doit voir.
--
-- Les évaluations ÉCRITES par la personne restent aussi, pour la même raison :
-- elles forment la réputation d'un tiers. Elles sont déjà anonymes à l'affichage.
--
-- ================================================= POURQUOI ON NE SUPPRIME PAS auth.users
-- `profiles.id` référence `auth.users(id)` en CASCADE. Supprimer l'utilisateur
-- effacerait donc la ligne de profil — que `rides` retient en NO ACTION. La
-- suppression échouerait, et elle échouerait UNIQUEMENT pour les comptes ayant
-- des courses, c'est-à-dire les seuls qui comptent.
--
-- On neutralise donc l'utilisateur au lieu de le détruire : identifiants
-- brouillés — un numéro rendu ne doit pas ramener l'ancien compte — bannissement
-- sans terme, et sessions détruites. Se reconnecter est impossible, et le
-- téléphone se déconnecte au prochain rafraîchissement de jeton. C'est la
-- suppression du COMPTE ; ce qui reste n'est plus une personne.
--
-- ========================================================= LE REFUS QUI COMPTE
-- Une course active bloque. Supprimer son compte pendant qu'un conducteur roule
-- vers vous laisse quelqu'un en chemin vers une adresse dont le demandeur vient
-- de s'effacer. On le refuse avec un message, pas avec une erreur générique.

-- ----------------------------------------------------- la question d'abord --
create or replace function public.suppression_possible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.rides r
    where (r.passager_id = (select auth.uid()) or r.conducteur_id = (select auth.uid()))
      and r.statut in ('verrouillee', 'en_route', 'arrive', 'commencee', 'en_cours')
  );
$$;

revoke all on function public.suppression_possible() from public, anon, authenticated;
grant execute on function public.suppression_possible() to authenticated;

comment on function public.suppression_possible() is
  'À demander AVANT d''effacer les fichiers de stockage : sans elle, on détruirait les pièces d''identité pour découvrir ensuite qu''une course active bloque la suppression.';

-- ------------------------------------------------------ la suppression --
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.rides r
    where (r.passager_id = v_uid or r.conducteur_id = v_uid)
      and r.statut in ('verrouillee', 'en_route', 'arrive', 'commencee', 'en_cours')
  ) then
    raise exception 'course_active' using errcode = 'P0001';
  end if;

  -- Une demande encore ouverte continuerait de recevoir des offres au nom de
  -- quelqu'un qui n'est plus là. On la ferme avant tout le reste.
  update public.ride_requests
     set statut = 'annulee'
   where passager_id = v_uid and statut = 'ouverte';

  delete from public.lieux_favoris where proprietaire = v_uid;
  delete from public.documents_conducteur where profil_id = v_uid;
  delete from public.vehicles where conducteur_id = v_uid;
  delete from public.positions_conducteurs where conducteur_id = v_uid;
  delete from public.blocages where bloqueur = v_uid or bloque = v_uid;
  delete from public.evaluations where cible_id = v_uid;

  update public.profiles
     set prenom = 'Compte supprimé',
         nom_complet = null,
         telephone = null,
         photo_url = null,
         note_moyenne = null,
         nb_notes = 0,
         est_admin = false,
         documents_valides_le = null
   where id = v_uid;

  -- Brouiller AVANT de bannir : un numéro sénégalais se réattribue, et le
  -- prochain porteur ne doit pas retomber sur ce compte.
  update auth.users
     set phone = null,
         phone_confirmed_at = null,
         email = null,
         email_confirmed_at = null,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = 'infinity'::timestamptz,
         updated_at = now()
   where id = v_uid;

  -- La session vivante meurt avec le compte, sans attendre que l'application
  -- veuille bien se déconnecter.
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;
end;
$$;

revoke all on function public.supprimer_mon_compte() from public, anon, authenticated;
grant execute on function public.supprimer_mon_compte() to authenticated;

comment on function public.supprimer_mon_compte() is
  'Suppression du compte par son propriétaire (App Store 5.1.1). Efface tout ce qui n''appartient qu''à lui, VIDE la ligne de profil que les courses retiennent, et neutralise l''utilisateur auth — on ne le supprime pas, la cascade emporterait le profil que rides retient en NO ACTION.';
