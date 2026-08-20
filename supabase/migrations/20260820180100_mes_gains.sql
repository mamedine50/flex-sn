-- Flex — ce que le conducteur a gagné.
--
-- Filtrée sur `auth.uid()` DANS la vue, pas par le client : les gains sont la
-- donnée qu'on regarderait chez le voisin en premier. Une vue qui rendrait tous
-- les conducteurs en comptant sur un `.eq()` côté application serait une fuite à
-- un oubli près.
--
-- « 0 % commission » n'est pas dans ces colonnes : c'est une promesse produit,
-- pas une donnée. Le jour où une commission existe, elle apparaît ici en
-- colonne — et l'écran cessera de pouvoir l'écrire en dur.
create view public.mes_gains
with (security_invoker = false) as
select
  c.conducteur_id as profil_id,
  count(*)::integer as courses,
  coalesce(sum(c.prix_convenu_xof), 0)::bigint as total_xof,
  coalesce(
    sum(c.prix_convenu_xof) filter (
      where c.terminee_le >= date_trunc('week', now())
    ), 0
  )::bigint as semaine_xof
from public.rides c
where c.statut = 'terminee'
  and c.conducteur_id = (select auth.uid())
group by c.conducteur_id;

revoke all on public.mes_gains from anon, authenticated;
grant select on public.mes_gains to authenticated;

comment on view public.mes_gains is
  'Gains du conducteur COURANT. Le filtre sur auth.uid() est dans la vue : le client ne peut pas l''oublier. Aucune ligne tant qu''aucune course n''est terminée — l''écran affiche alors zéro, ce qui est la vérité.';
