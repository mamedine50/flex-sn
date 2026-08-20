-- Flex — un numéro n'est pas forcément sénégalais.
--
-- La contrainte d'origine imposait `^\+221[0-9]{9}$`, et le déclencheur
-- d'inscription posait NULL pour tout le reste « plutôt que de faire échouer
-- l'inscription ». Conséquence, découverte en câblant l'écran de connexion :
-- quelqu'un qui s'inscrit avec un numéro étranger — un expatrié, un visiteur,
-- ou nous-mêmes en test — obtient un profil SANS téléphone. Et un profil sans
-- téléphone, c'est le bouton « Appeler » qui disparaît pendant la course, sans
-- que rien ne dise pourquoi.
--
-- Perdre silencieusement un vrai numéro est pire que d'en accepter un étranger.
-- On passe donc au format E.164, celui-là même que le fournisseur SMS attend.
alter table public.profiles drop constraint profiles_telephone_check;

alter table public.profiles add constraint profiles_telephone_check
  check (telephone ~ '^\+[1-9][0-9]{6,14}$');

comment on column public.profiles.telephone is
  'Numéro au format E.164, indicatif compris. Servi UNIQUEMENT à la contrepartie d''une course active — voir la policy profiles_contrepartie_course_active.';

-- Le déclencheur suit : il normalise en E.164 au lieu de ne reconnaître que le
-- Sénégal. `create or replace` — aucune colonne générée ne dépend de ce corps.
create or replace function public.creer_profil_a_l_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, prenom, telephone)
  values (
    new.id,
    -- Le prénom vient des métadonnées d'inscription. À défaut un repli neutre :
    -- refuser l'inscription faute de prénom serait pire, et l'écran « Votre
    -- prénom » le demande juste après.
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'prenom'), ''), 'Passager'),
    -- `auth.users.phone` est stocké sans le `+`. On le remet, et on garde le
    -- numéro tel quel dès qu'il ressemble à de l'E.164.
    case
      when new.phone ~ '^\+?[1-9][0-9]{6,14}$'
        then '+' || regexp_replace(new.phone, '^\+', '')
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
