-- Flex — les index que les nouvelles lectures réclament.
--
-- `courses_comme_conducteur()` est appelée UNE FOIS PAR LIGNE de
-- `profils_publics` et une fois par offre reçue. Sans index, c'est un balayage
-- complet de `rides` par offre affichée : invisible sur une base de test,
-- douloureux au millième conducteur.
--
-- Index PARTIEL sur `terminee` : c'est le seul statut que ces deux lectures
-- regardent, et une course active se compte sur les doigts d'une main quand une
-- course terminée s'accumule pour toujours.
create index rides_conducteur_terminee
  on public.rides (conducteur_id) where statut = 'terminee';

-- Le passager cherche SA course active, et la clé étrangère n'était couverte
-- par rien : un `delete` sur un profil balayait la table.
create index rides_passager_id on public.rides (passager_id);

-- `submit_offer()` vérifie qu'un conducteur n'a pas déjà répondu, et l'écran
-- conducteur relit ses propres offres.
create index offers_conducteur_id on public.offers (conducteur_id);
