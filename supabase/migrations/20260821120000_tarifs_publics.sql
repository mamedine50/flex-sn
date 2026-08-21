-- Flex — la fourchette de prix se lit SANS compte.
--
-- La règle du parcours est « on regarde d'abord, on s'inscrit quand on agit ».
-- L'accueil et le choix de lieu la respectaient déjà ; l'écran « Fixez votre
-- prix » ne la respectait pas : `bornes_prix` n'était lisible que par
-- `authenticated`, donc un visiteur sans compte y lisait « Impossible de
-- charger la fourchette de prix » et le bouton d'envoi restait éteint. Le seul
-- écran qui explique le produit était le seul qu'on ne pouvait pas regarder.
--
-- CE QU'ON OUVRE, ET POURQUOI C'EST SANS DANGER. `bornes_prix` est une grille
-- publique : un minimum, un maximum, un prix de base et un prix au kilomètre,
-- par service. C'est la vitrine, pas une donnée personnelle. `prix_suggere()`
-- n'en est que l'arithmétique — elle multiplie cette grille par une distance
-- entre deux points que l'appelant fournit lui-même. Ni l'une ni l'autre ne
-- rend une ligne appartenant à quiconque.
--
-- CE QU'ON N'OUVRE PAS. Rien d'autre. `create_ride_request()` reste
-- authentifiée : proposer un prix reste un acte, et c'est là que la connexion
-- s'exige. Regarder la grille n'engage personne ; envoyer une demande, si.

create policy bornes_prix_lecture_anon on public.bornes_prix
  for select to anon
  using (true);

grant select on public.bornes_prix to anon;

grant execute on function public.prix_suggere(
  public.service_course, double precision, double precision,
  double precision, double precision) to anon;

comment on table public.bornes_prix is
  'Grille publique, lisible sans session : c''est la vitrine du produit. Ouvrir une AUTRE table à anon demande la même justification écrite — et une entrée dans l''inventaire de supabase/tests/010_schema.sql.';
