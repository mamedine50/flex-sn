-- Flex — remplacer sa photo, sans laisser l'ancienne derrière.
--
-- Une photo déposée sous un chemin fixe se heurte aux caches : même chemin,
-- même URL côté image, et l'ancienne s'affiche encore. On dépose donc sous un
-- chemin unique — et il faut alors pouvoir effacer le précédent, sinon chaque
-- changement de photo laisse un fichier orphelin pour toujours.
--
-- Le droit d'effacer s'arrête à son propre dossier, comme le droit d'écrire.
create policy photos_profil_suppression on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos-profil'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
