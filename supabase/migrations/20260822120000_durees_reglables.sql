-- Flex — les durées quittent le code pour une table.
--
-- ============================================================== LE DÉFAUT
-- Une demande urbaine vivait 5 minutes, et une OFFRE 2 minutes. Le conducteur
-- proposait, et le passager avait deux minutes pour la voir avant qu'elle ne
-- devienne caduque. Constaté à l'essai : « il n'arrive pas à voir de chauffeurs
-- alors qu'il y a eu des propositions » — les propositions avaient expiré.
--
-- Deux minutes, c'était déjà court avant. Depuis que la négociation compte
-- QUATRE tours, c'est impossible : personne ne fait deux allers-retours de prix
-- en deux minutes.
--
-- ============================================== UNE OFFRE VIT AUTANT QUE SA DEMANDE
-- C'est la règle qui remplace le chiffre. Une offre qui meurt avant la demande
-- fait disparaître un choix pendant que le passager compare — et il ne se passe
-- rien à l'écran qui lui dise pourquoi. Le plafond au `expires_at` de la
-- demande existait déjà dans `submit_offer` ; il devient la seule borne.
--
-- ============================================== ET LES DURÉES SE RÈGLENT EN BASE
-- Comme les bornes de prix, et pour la même raison : le jour où l'usage réel se
-- révèle, on change une ligne de table, pas une migration ni une version de
-- l'application. Les valeurs d'aujourd'hui sont des paris, pas des mesures.
create table public.durees_service (
  service public.service_course primary key,
  duree_demande interval not null check (duree_demande between interval '1 minute' and interval '2 hours')
);

comment on table public.durees_service is
  'Combien de temps une demande reste ouverte. Une OFFRE vit aussi longtemps que sa demande — voir duree_offre().';

insert into public.durees_service (service, duree_demande) values
  ('urbain', interval '15 minutes'),
  ('interurbain', interval '45 minutes');

alter table public.durees_service enable row level security;
revoke all on public.durees_service from public, anon, authenticated;
grant select on public.durees_service to authenticated;

create policy durees_lecture on public.durees_service
  for select to authenticated using (true);

-- Les fonctions cessent d'être IMMUTABLE : elles lisent une table.
create or replace function public.duree_demande(p_service public.service_course)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select d.duree_demande from public.durees_service d where d.service = p_service;
$$;

create or replace function public.duree_offre(p_service public.service_course)
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  -- La MÊME que la demande. `submit_offer` plafonne déjà au `expires_at` de la
  -- demande : l'offre ne peut donc pas lui survivre, et elle ne meurt plus
  -- avant elle.
  select d.duree_demande from public.durees_service d where d.service = p_service;
$$;

revoke all on function public.duree_demande(public.service_course) from public, anon, authenticated;
revoke all on function public.duree_offre(public.service_course) from public, anon, authenticated;
grant execute on function public.duree_demande(public.service_course) to authenticated;
grant execute on function public.duree_offre(public.service_course) to authenticated;

-- Les demandes déjà ouvertes profitent de la nouvelle durée : sinon celles en
-- cours pendant la migration expireraient sur l'ancienne règle, sans que
-- personne comprenne pourquoi.
update public.ride_requests
   set expires_at = cree_le + public.duree_demande(service)
 where statut = 'ouverte';

update public.offers o
   set expires_at = d.expires_at
  from public.ride_requests d
 where d.id = o.demande_id
   and o.statut = 'en_attente';
