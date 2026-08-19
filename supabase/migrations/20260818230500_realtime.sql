-- Flex — Realtime sur les offres.
--
-- C'est le cœur de l'écran « Offres reçues » : le passager voit les réponses
-- arriver sans rafraîchir. Realtime applique la RLS d'`offers`, donc chacun ne
-- reçoit que ce que sa policy lui accorde déjà.

-- `full` : sans ça, un UPDATE ne diffuse que les colonnes modifiées et le
-- client ne peut pas savoir de quelle offre il s'agit quand elle devient
-- caduque.
alter table public.offers replica identity full;

alter publication supabase_realtime add table public.offers;
