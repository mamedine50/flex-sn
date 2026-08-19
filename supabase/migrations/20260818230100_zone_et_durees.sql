-- Flex — zone approximative et durées de négociation.

-- ------------------------------------------------------ zone approximative --
-- Taille de la maille servie avant acceptation. 0,005° ≈ 550 m en latitude,
-- ≈ 540 m en longitude à la latitude de Dakar.
create function public.taille_cellule_deg()
returns double precision
language sql
immutable
parallel safe
as $$ select 0.005::double precision $$;

-- Arrondi de zone — STABLE, jamais bruité.
--
-- La même coordonnée rend toujours exactement le même centre de maille. C'est
-- la propriété qui compte : un bruit aléatoire re-tiré à chaque lecture se
-- moyenne, et la moyenne de N lectures converge vers le point exact. Autrement
-- dit un bruit trahit le passager d'autant plus vite qu'on le lit souvent.
--
-- Ici, lire mille fois n'apprend rien de plus que lire une fois.
create function public.arrondir_zone(coord double precision)
returns double precision
language sql
immutable
parallel safe
as $$
  select floor(coord / public.taille_cellule_deg()) * public.taille_cellule_deg()
       + public.taille_cellule_deg() / 2;
$$;

comment on function public.arrondir_zone(double precision) is
  'Centre de la maille contenant la coordonnée. Déterministe : ne jamais remplacer par un bruit aléatoire, une moyenne de lectures trahirait le point exact.';

-- ------------------------------------------------------------------ durées --
-- Une demande urbaine vit court : le passager attend sur le trottoir. Une
-- demande interurbaine se prépare, elle vit plus longtemps.
create function public.duree_demande(p_service public.service_course)
returns interval
language sql
immutable
parallel safe
as $$
  select case p_service
    when 'urbain' then interval '5 minutes'
    when 'interurbain' then interval '30 minutes'
  end;
$$;

-- Une offre expire avant sa demande : un prix proposé il y a dix minutes ne
-- vaut plus rien, et le conducteur a bougé.
create function public.duree_offre(p_service public.service_course)
returns interval
language sql
immutable
parallel safe
as $$
  select case p_service
    when 'urbain' then interval '2 minutes'
    when 'interurbain' then interval '10 minutes'
  end;
$$;
