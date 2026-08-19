-- Flex — qui a annulé, et pourquoi.
alter table public.rides
  add column annulee_par uuid references public.profiles (id),
  add column motif_annulation text check (length(btrim(motif_annulation)) between 1 and 200);

comment on column public.rides.annulee_par is
  'Qui a annulé. En annulation croisée, le premier gagne — le second reçoit une erreur, pas un état incohérent.';
