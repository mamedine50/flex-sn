-- Flex — les centroïdes des communes viennent d'OpenStreetMap.
--
-- Les 32 coordonnées de `20260819090200_communes.sql` étaient saisies à la main
-- et approximatives. Là où OSM connaît le lieu, on prend sa position : elle est
-- issue de contributions locales, pas d'une estimation faite de loin.
--
-- Ce que cette migration NE fait pas : passer aux polygones. L'attribution reste
-- « le centroïde le plus proche », donc juste au cœur d'une commune et floue à
-- la frontière. Le remède réel est le tracé administratif, et il viendra.
--
-- Découverte au passage : le point 14,6928 / -17,4467, qu'un `todo` attendait
-- nommé « Plateau », est à 292 m de Colobane et à 2 985 m de Dakar-Plateau. Ce
-- n'étaient pas les centroïdes qui étaient faux, c'était l'attente.
update public.communes set lat = 14.667317, lon = -17.437966 where code = 'dk-plateau';
update public.communes set lat = 14.680487, lon = -17.450928 where code = 'dk-medina';
update public.communes set lat = 14.696478, lon = -17.464182 where code = 'dk-fann';
update public.communes set lat = 14.695118, lon = -17.445426 where code = 'dk-gueule-tapee';
update public.communes set lat = 14.705464, lon = -17.454109 where code = 'dk-grand-dakar';
update public.communes set lat = 14.709451, lon = -17.449835 where code = 'dk-biscuiterie';
update public.communes set lat = 14.710073, lon = -17.444181 where code = 'dk-hlm';
update public.communes set lat = 14.707445, lon = -17.474397 where code = 'dk-mermoz';
update public.communes set lat = 14.724737, lon = -17.485066 where code = 'dk-ouakam';
update public.communes set lat = 14.748791, lon = -17.514961 where code = 'dk-ngor';
update public.communes set lat = 14.760358, lon = -17.468149 where code = 'dk-yoff';
update public.communes set lat = 14.736683, lon = -17.452813 where code = 'dk-grand-yoff';
update public.communes set lat = 14.759407, lon = -17.438455 where code = 'dk-parcelles';
update public.communes set lat = 14.771003, lon = -17.423697 where code = 'dk-camberene';
