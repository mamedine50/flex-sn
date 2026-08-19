-- Flex — RLS et droits.
--
-- Principe : aucune écriture directe depuis le client. Les tables ne reçoivent
-- que `select`, sous RLS ; tout le reste passe par les fonctions RPC. Un
-- `grant insert` sur une table contournerait `create_ride_request()` et ses
-- bornes de prix.

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.ride_requests enable row level security;
alter table public.offers enable row level security;
alter table public.rides enable row level security;
alter table public.bornes_prix enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.vehicles from anon, authenticated;
revoke all on public.ride_requests from anon, authenticated;
revoke all on public.offers from anon, authenticated;
revoke all on public.rides from anon, authenticated;
revoke all on public.bornes_prix from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.vehicles to authenticated;
grant select on public.ride_requests to authenticated;
grant select on public.offers to authenticated;
grant select on public.rides to authenticated;
grant select on public.bornes_prix to authenticated;

-- ---------------------------------------------------------------- profiles --
-- Sa propre ligne, toujours.
create policy profiles_soi_meme on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- La ligne de la contrepartie — donc `nom_complet` et `telephone` — seulement
-- pendant une course verrouillée ou en cours. Avant acceptation : rien. Après
-- la fin de la course : plus rien non plus, le conducteur n'a pas à garder le
-- numéro d'un passager qu'il a déposé.
create policy profiles_contrepartie_course_active on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.rides c
      where c.statut in ('verrouillee', 'en_cours')
        and (
          (c.conducteur_id = (select auth.uid()) and c.passager_id = public.profiles.id)
          or (c.passager_id = (select auth.uid()) and c.conducteur_id = public.profiles.id)
        )
    )
  );

-- ---------------------------------------------------------------- vehicles --
-- La plaque n'est servie qu'une fois la course verrouillée : avant, le
-- passager voit modèle et couleur par `vehicules_publics`.
create policy vehicles_soi_meme on public.vehicles
  for select to authenticated
  using (conducteur_id = (select auth.uid()));

create policy vehicles_course_active on public.vehicles
  for select to authenticated
  using (
    exists (
      select 1
      from public.rides c
      where c.vehicule_id = public.vehicles.id
        and c.statut in ('verrouillee', 'en_cours')
        and c.passager_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------- ride_requests --
-- Le passager voit ses demandes. Le conducteur ne voit la demande complète —
-- donc la position exacte — qu'une fois la course à lui.
create policy ride_requests_passager on public.ride_requests
  for select to authenticated
  using (passager_id = (select auth.uid()));

create policy ride_requests_conducteur_apres_acceptation on public.ride_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.rides c
      where c.demande_id = public.ride_requests.id
        and c.conducteur_id = (select auth.uid())
        and c.statut in ('verrouillee', 'en_cours')
    )
  );

-- ------------------------------------------------------------------ offers --
-- Le conducteur voit les siennes ; le passager voit celles qui répondent à ses
-- demandes — c'est ce que Realtime lui pousse.
create policy offers_conducteur on public.offers
  for select to authenticated
  using (conducteur_id = (select auth.uid()));

create policy offers_passager_destinataire on public.offers
  for select to authenticated
  using (
    exists (
      select 1
      from public.ride_requests d
      where d.id = public.offers.demande_id
        and d.passager_id = (select auth.uid())
    )
  );

-- ------------------------------------------------------------------- rides --
create policy rides_parties_prenantes on public.rides
  for select to authenticated
  using (
    passager_id = (select auth.uid()) or conducteur_id = (select auth.uid())
  );

-- ------------------------------------------------------------- bornes_prix --
-- Publiques : l'écran « Fixez votre prix » affiche la fourchette.
create policy bornes_prix_lecture on public.bornes_prix
  for select to authenticated
  using (true);
