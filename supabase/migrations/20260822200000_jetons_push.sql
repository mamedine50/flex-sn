-- Flex — les notifications qui arrivent quand l'application est fermée.
--
-- ================================================== CE QUI MANQUAIT
-- La table `notifications` rattrape tout ce qu'on a manqué — mais seulement
-- quand on rouvre l'application. Un passager qui attend dehors, téléphone en
-- poche, n'apprend que son conducteur est arrivé qu'en ressortant le téléphone.
-- C'est exactement l'inverse de ce qu'on veut.
--
-- Le push est la seule chose qui traverse un téléphone verrouillé.
--
-- ================================== UN JETON PAR APPAREIL, PAS PAR PERSONNE
-- Quelqu'un peut avoir Flex sur deux téléphones — le sien et celui d'un
-- proche à qui il l'a fait installer. La clé primaire est LE JETON ; le
-- propriétaire n'est qu'une colonne. Une clé sur le profil écraserait le
-- premier appareil à chaque connexion sur le second, et l'un des deux
-- deviendrait sourd sans que rien ne le dise.
--
-- ================================================== UN JETON SE PÉRIME
-- Expo répond `DeviceNotRegistered` quand l'application a été désinstallée ou
-- que le jeton a tourné. La fonction d'envoi efface alors la ligne : un jeton
-- mort qu'on garde, c'est un envoi payé pour rien à chaque notification, et une
-- table qui grossit sans que personne ne la regarde.
create table public.jetons_push (
  jeton text primary key,
  profil_id uuid not null references public.profiles (id) on delete cascade,
  -- « ios » ou « android ». Sert au diagnostic, jamais au routage : Expo
  -- s'occupe d'APNs et de FCM, on ne veut pas le savoir.
  plateforme text not null check (plateforme in ('ios', 'android')),
  maj_le timestamptz not null default now()
);

comment on table public.jetons_push is
  'Les appareils qui peuvent recevoir un push. Un jeton par APPAREIL : la clé est le jeton, pas le profil — sinon un second téléphone rendrait le premier sourd en silence.';

create index jetons_push_par_profil on public.jetons_push (profil_id);

alter table public.jetons_push enable row level security;
revoke all on public.jetons_push from public, anon, authenticated;

-- AUCUNE POLICY, ET C'EST LA FORME LA PLUS CLAIRE DU REFUS. Un jeton push n'a
-- rien à faire dans un client : le posséder permet d'envoyer une notification à
-- quelqu'un. Seule la fonction d'envoi le lit, en `service_role`, qui traverse
-- la RLS.
--
-- On n'écrit pas une policy `using (false)` : elle laisserait croire qu'une
-- lecture est prévue et qu'un filtre la restreint. Ici il n'y a pas de filtre,
-- il n'y a pas de lecture. Le `revoke all` ci-dessus fait le travail, la RLS
-- activée sans policy ferme la porte une seconde fois.

-- ------------------------------------------------------------ enregistrer --
create function public.enregistrer_jeton_push(
  p_jeton text,
  p_plateforme text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_plateforme not in ('ios', 'android') then
    raise exception 'plateforme_inconnue' using errcode = 'P0001';
  end if;

  -- Le même jeton peut CHANGER DE MAIN : un téléphone prêté, deux comptes.
  -- Le dernier connecté le récupère, sinon l'ancien propriétaire continuerait
  -- de recevoir sur un appareil qui n'est plus le sien.
  insert into public.jetons_push (jeton, profil_id, plateforme)
  values (btrim(p_jeton), v_uid, p_plateforme)
  on conflict (jeton) do update
    set profil_id = excluded.profil_id,
        plateforme = excluded.plateforme,
        maj_le = now();
end;
$$;

revoke all on function public.enregistrer_jeton_push(text, text) from public, anon, authenticated;
grant execute on function public.enregistrer_jeton_push(text, text) to authenticated;

comment on function public.enregistrer_jeton_push(text, text) is
  'Attache un appareil au compte connecté. Le même jeton peut changer de main : un téléphone prêté, deux comptes.';

-- ---------------------------------------------------------------- oublier --
-- À la déconnexion. Sans ça, le téléphone continuerait de recevoir les
-- notifications de quelqu'un qui s'est délibérément déconnecté — le contraire
-- exact de ce qu'il a demandé.
create function public.oublier_jeton_push(p_jeton text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  delete from public.jetons_push
   where jeton = btrim(p_jeton) and profil_id = v_uid;
end;
$$;

revoke all on function public.oublier_jeton_push(text) from public, anon, authenticated;
grant execute on function public.oublier_jeton_push(text) to authenticated;
