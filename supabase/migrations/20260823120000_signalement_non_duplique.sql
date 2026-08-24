-- Flex — un signalement rejoué n'en crée pas deux.
--
-- ============================================== D'OÙ VIENT CE CORRECTIF
-- Deux relectures d'architecture ont pointé l'absence de clé d'idempotence sur
-- les commandes. Vérification faite, les gestes qui coûtent de l'argent sont
-- déjà protégés par des contraintes métier — une demande ouverte à la fois, une
-- offre en attente par conducteur et par demande, une note par course et par
-- auteur. Le rejeu y est refusé, pas doublé.
--
-- Deux gestes ne l'étaient pas : le message et le signalement.
--
-- ================================== POURQUOI LE SIGNALEMENT ET PAS LE MESSAGE
-- Un message en double est un désagrément : on le voit, on comprend, on passe.
-- Un SIGNALEMENT en double fausse une file de modération — deux lignes pour un
-- seul fait, et une personne qui paraît signalée deux fois. C'est le genre de
-- chiffre sur lequel on finit par décider quelque chose.
--
-- ============================== LA CLÉ INCLUT LE MOTIF, ET C'EST DÉLIBÉRÉ
-- Sur une même course, on peut légitimement reprocher deux choses différentes —
-- une insulte ET une conduite dangereuse. Verrouiller sur (auteur, cible,
-- course) interdirait le second signalement légitime.
--
-- En incluant le motif, on attrape ce qu'on vise : le RÉSEAU qui coupe entre le
-- commit et la réponse, et l'utilisateur qui réappuie. Ce second appui porte le
-- même motif, par construction — il ne change pas d'avis en deux secondes.
create unique index signalements_sans_doublon
  on public.signalements (auteur, cible, course_id, motif, porte_sur_avis);

comment on index public.signalements_sans_doublon is
  'Un signalement rejoué après une coupure réseau n''en crée pas deux. Le motif fait partie de la clé : deux reproches DIFFÉRENTS sur la même course restent possibles.';
