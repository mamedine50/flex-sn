-- La valeur d'énumération ajoutée en 20260822180000 devient utilisable ici :
-- Postgres refuse qu'elle serve dans la transaction qui la crée.
create or replace function public.notifier_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acteur uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    perform public.deposer_notification(
      new.passager_id, 'offre_acceptee', new.demande_id, new.id,
      new.prix_convenu_xof, v_acteur);
    perform public.deposer_notification(
      new.conducteur_id, 'offre_acceptee', new.demande_id, new.id,
      new.prix_convenu_xof, v_acteur);

    -- Les autres conducteurs apprennent que c'est pris. Sans le montant : le
    -- prix auquel un autre a été retenu ne les regarde pas, et le leur dire
    -- tirerait tous les prix dans le même sens.
    perform public.deposer_notification(
      c.conducteur_id, 'offre_caduque', new.demande_id, null, null, null)
    from (
      select distinct o.conducteur_id
      from public.offers o
      where o.demande_id = new.demande_id
        and o.conducteur_id <> new.conducteur_id
    ) c;

    return new;
  end if;

  -- LE CONDUCTEUR EST LÀ. La seule étape du trajet qui vaut une notification :
  -- le passager attend dehors, téléphone en poche, canal temps réel fermé.
  if new.statut = 'arrive' and old.statut <> 'arrive' then
    perform public.deposer_notification(
      new.passager_id, 'conducteur_arrive', new.demande_id, new.id,
      null, new.conducteur_id);
  end if;

  if new.statut = 'annulee' and old.statut <> 'annulee' then
    perform public.deposer_notification(
      new.passager_id, 'course_annulee', new.demande_id, new.id,
      null, new.annulee_par);
    perform public.deposer_notification(
      new.conducteur_id, 'course_annulee', new.demande_id, new.id,
      null, new.annulee_par);
  end if;

  return new;
end;
$$;

revoke all on function public.notifier_course() from public, anon, authenticated;
