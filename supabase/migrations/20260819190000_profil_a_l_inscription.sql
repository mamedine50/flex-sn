-- Flex — un compte sans profil ne peut rien faire.
--
-- Trou trouvé en câblant l'authentification : `auth.users` se remplit à
-- l'inscription, mais rien ne créait la ligne `profiles` correspondante. Un
-- utilisateur fraîchement inscrit aurait reçu `profil_absent` au premier appel
-- de `create_ride_request()`, sans aucun moyen de se créer un profil — les
-- tables n'accordent aucune écriture au client.

create function public.creer_profil_a_l_inscription()
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
    -- refuser l'inscription faute de prénom serait pire, et l'utilisateur le
    -- corrigera par `maj_profil()`.
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'prenom'), ''), 'Passager'),
    -- `auth.users.phone` est stocké sans le `+`. La contrainte de `profiles`
    -- l'exige : on normalise, et on met NULL plutôt que de faire échouer
    -- l'inscription sur un numéro d'un autre pays.
    case
      when new.phone ~ '^\+?221[0-9]{9}$'
        then '+' || regexp_replace(new.phone, '^\+', '')
      else null
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger creer_profil_apres_inscription
after insert on auth.users
for each row execute function public.creer_profil_a_l_inscription();

-- Compléter son propre profil. Par RPC, comme toute écriture : `profiles`
-- n'accorde que `select`.
--
-- On ne peut modifier QUE sa propre ligne, et seulement les champs qu'un
-- utilisateur a le droit de choisir. Ni `role`, ni `documents_valides_le`, ni
-- `note_moyenne` : ceux-là se gagnent, ils ne se déclarent pas.
create function public.maj_profil(
  p_prenom text default null,
  p_nom_complet text default null,
  p_langue text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_profil public.profiles;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_langue is not null and p_langue not in ('fr', 'en', 'wo') then
    raise exception 'langue_inconnue' using errcode = 'P0001';
  end if;

  update public.profiles
  set prenom = coalesce(nullif(btrim(p_prenom), ''), prenom),
      nom_complet = coalesce(nullif(btrim(p_nom_complet), ''), nom_complet),
      langue = coalesce(p_langue, langue)
  where id = v_uid
  returning * into v_profil;

  if v_profil.id is null then
    raise exception 'profil_absent' using errcode = 'P0001';
  end if;

  return v_profil;
end;
$$;

revoke all on function public.maj_profil(text, text, text) from public, anon, authenticated;
grant execute on function public.maj_profil(text, text, text) to authenticated;
