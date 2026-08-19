-- Flex — tarifs de référence PROVISOIRES.
--
-- Ces chiffres viennent d'une estimation, pas d'une enquête : ils n'ont PAS été
-- vérifiés auprès de conducteurs dakarois. Ils sont posés pour que l'écran de
-- prix ouvre sur un montant crédible plutôt que sur un champ vide, et ils
-- doivent être confirmés sur le terrain.
--
-- Le test `todo` de `supabase/tests/130_prix_suggere.sql` porte cette dette et
-- restera visible dans la sortie pgTAP jusqu'à confirmation. C'est le même
-- dispositif que pour les centroïdes de communes : des chiffres provisoires ne
-- deviennent pas définitifs par oubli.
--
-- Calibrage : `st_distance` est à vol d'oiseau, et un trajet routier à Dakar
-- fait environ 1,3 fois cette distance. 150 F/km à vol d'oiseau revient donc à
-- près de 115 F/km réels.
--
-- Ordres de grandeur attendus :
--   Ouakam → Plateau    ≈ 2 150 F   (taxi dakarois)
--   Dakar → Thiès       ≈ 1 900 F   (place de sept-places)
--   Dakar → Touba       ≈ 4 300 F
--   Dakar → Saint-Louis ≈ 5 700 F
update public.bornes_prix
set prix_base_xof = 500, prix_km_xof = 150
where service = 'urbain';

update public.bornes_prix
set prix_base_xof = 500, prix_km_xof = 20
where service = 'interurbain';
