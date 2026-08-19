-- Flex — search_path figé sur les fonctions utilitaires.
--
-- Signalé par les advisors Supabase : `taille_cellule_deg`, `arrondir_zone`,
-- `duree_demande` et `duree_offre` avaient un search_path mutable. Elles ne sont
-- pas SECURITY DEFINER, donc le risque est moindre — mais `arrondir_zone` est
-- appelée depuis une COLONNE GÉNÉRÉE et depuis des vues qui, elles, contournent
-- la RLS. Une fonction dont la résolution dépend du search_path de l'appelant
-- n'a rien à faire dans ce chemin-là.
--
-- `alter function ... set` et non `create or replace` : on ne touche pas au
-- corps, seulement au réglage. Remplacer le corps d'une fonction dont dépend une
-- colonne générée est une opération qu'on ne fait pas à la légère.
alter function public.taille_cellule_deg() set search_path = '';
alter function public.arrondir_zone(double precision) set search_path = '';
alter function public.duree_demande(public.service_course) set search_path = '';
alter function public.duree_offre(public.service_course) set search_path = '';
