-- Flex — le cycle de vie d'une course.
--
-- verrouillee → en_route → arrive → commencee → terminee, piloté par le
-- conducteur. `annulee` peut survenir tant que la course n'a pas commencé.
--
-- `alter type ... add value` doit être SEUL dans sa migration : Postgres refuse
-- d'utiliser une valeur d'énumération dans la transaction qui l'a créée.
alter type public.statut_course add value if not exists 'en_route' after 'verrouillee';
alter type public.statut_course add value if not exists 'arrive' after 'en_route';
alter type public.statut_course add value if not exists 'commencee' after 'arrive';
