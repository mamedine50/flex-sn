-- Flex — les deux dépôts de fichiers.
--
-- `documents-conducteur` : PRIVÉ. Une pièce d'identité ne se lit que par son
-- propriétaire et par le back-office. Personne d'autre, jamais.
--
-- `photos-profil` : lisible par tout utilisateur CONNECTÉ — c'est la photo qu'un
-- passager voit sur une offre. Pas public : une photo de visage indexable par un
-- moteur de recherche est un problème qu'on ne se crée pas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents-conducteur', 'documents-conducteur', false, 8388608,
   array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('photos-profil', 'photos-profil', false, 4194304,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Chacun écrit dans SON dossier, nommé par son identifiant. Le premier segment
-- du chemin est l'uid : c'est ce que vérifient ces policies, et c'est aussi ce
-- que vérifie `soumettre_document()`.
create policy documents_conducteur_lecture on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents-conducteur'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy documents_conducteur_depot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents-conducteur'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy documents_conducteur_remplacement on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents-conducteur'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- La photo de profil : chacun écrit la sienne, tout le monde la lit une fois
-- connecté.
create policy photos_profil_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'photos-profil');

create policy photos_profil_depot on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos-profil'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy photos_profil_remplacement on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos-profil'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
