-- Flex — ce que le conducteur a gagné AUJOURD'HUI.
--
-- Sa maison affiche le jour, pas la semaine : quand on est au volant, la
-- question est « est-ce que ma journée vaut le coup », pas « où en est mon
-- mois ». La semaine reste sur le Profil, où l'on regarde à froid.
--
-- `create or replace` : les colonnes existantes gardent nom, type et ordre, les
-- nouvelles s'ajoutent à la fin — les droits survivent.
create or replace view public.mes_gains
with (security_invoker = false) as
select
  c.conducteur_id as profil_id,
  count(*)::integer as courses,
  coalesce(sum(c.prix_convenu_xof), 0)::bigint as total_xof,
  coalesce(
    sum(c.prix_convenu_xof) filter (
      where c.terminee_le >= date_trunc('week', now())
    ), 0
  )::bigint as semaine_xof,
  -- Le jour civil, pas « les 24 dernières heures » : un conducteur compte sa
  -- journée, et une journée finit à minuit.
  coalesce(
    sum(c.prix_convenu_xof) filter (
      where c.terminee_le >= date_trunc('day', now())
    ), 0
  )::bigint as jour_xof,
  count(*) filter (where c.terminee_le >= date_trunc('day', now()))::integer
    as courses_jour
from public.rides c
where c.statut = 'terminee'
  and c.conducteur_id = (select auth.uid())
group by c.conducteur_id;

comment on view public.mes_gains is
  'Gains du conducteur COURANT. Le filtre sur auth.uid() est dans la vue : le client ne peut pas l''oublier. `jour_xof` sert la maison du conducteur, `semaine_xof` le Profil.';
