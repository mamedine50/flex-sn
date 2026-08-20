-- Flex — les noms d'usage des quartiers.
--
-- Personne ne dit « Sicap-Liberté » : on dit SICAP, ou Baobab. Une recherche qui
-- ne connaît que le nom administratif ne trouve rien à ce qu'on tape vraiment.
--
-- Seed modeste et volontairement incomplet : les vrais alias viendront du
-- terrain, en écoutant ce que les gens cherchent sans résultat.
alter table public.communes
  add column alias text[] not null default '{}';

comment on column public.communes.alias is
  'Noms d''usage, pour la recherche. Le filtrage est LOCAL et insensible aux accents et à la casse — aucun appel réseau, aucun service de géocodage.';

update public.communes set alias = '{SICAP,Baobab,Liberte}' where code = 'dk-sicap';
update public.communes set alias = '{Point E,Amitie,Fann Hock}' where code = 'dk-fann';
update public.communes set alias = '{Colobane,Fass,Gueule Tapee}' where code = 'dk-gueule-tapee';
update public.communes set alias = '{Sacre Coeur,Mermoz}' where code = 'dk-mermoz';
update public.communes set alias = '{Almadies,Mamelles}' where code = 'dk-ngor';
update public.communes set alias = '{Aeroport,Yoff Tonghor}' where code = 'dk-yoff';
update public.communes set alias = '{Centre ville,Independance,Sandaga}' where code = 'dk-plateau';
update public.communes set alias = '{Marche Tilene}' where code = 'dk-medina';
update public.communes set alias = '{Castors,Bourguiba}' where code = 'dk-grand-dakar';
update public.communes set alias = '{Derkle}' where code = 'dk-dieuppeul';
update public.communes set alias = '{Front de Terre}' where code = 'dk-hlm';
update public.communes set alias = '{Bel Air,Hann}' where code = 'dk-hann';
update public.communes set alias = '{PA,Parcelles}' where code = 'dk-parcelles';
update public.communes set alias = '{Grand Yoff,Zone de captage}' where code = 'dk-grand-yoff';
update public.communes set alias = '{Patte d Oie,Foire}' where code = 'dk-patte-doie';
update public.communes set alias = '{Cite Avion}' where code = 'dk-ouakam';
