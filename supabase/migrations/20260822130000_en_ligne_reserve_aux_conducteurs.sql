-- Flex — on ne passe pas en ligne avec un dossier incomplet.
--
-- ================================================= CE QUI ÉTAIT OUVERT
-- `maj_position()` ne vérifiait QUE l'authentification. N'importe quel compte
-- pouvait donc se déclarer `en_ligne` sans une seule pièce validée. L'écran ne
-- montre pas le bouton GO à qui n'a pas la capacité — mais un écran qui cache
-- n'est pas un serveur qui refuse, et c'est la règle du dépôt : la logique
-- métier se tient en base, pas dans un bouton grisé.
--
-- Ce n'était pas exploitable pour VOLER une course : `demandes_ouvertes` filtre
-- déjà sur `est_conducteur()`, donc un intrus en ligne ne voyait rien. Mais il
-- écrivait sa position dans une table de conducteurs, y restait, et se comptait
-- parmi les conducteurs en ligne. On ne garde pas une porte ouverte parce que
-- la pièce derrière est vide.
--
-- ============================================ CE QU'ON NE FERME PAS
-- SE METTRE HORS LIGNE RESTE TOUJOURS POSSIBLE. Sans cette exception, un
-- conducteur qui perd sa capacité pendant qu'il attend — un document refusé,
-- une pièce ajoutée au dossier — resterait `en_ligne` pour l'éternité, sans
-- aucun moyen d'en sortir. On refuse d'ENTRER, jamais de sortir.
--
-- UNE COURSE EN COURS PASSE AUSSI. Pendant une course, `maj_position()` est le
-- fil qui montre la voiture avancer sur l'écran du passager. Si un document est
-- refusé au milieu du trajet, le passager perdrait le suivi de la voiture dans
-- laquelle il est ASSIS. La capacité décide qui prend une course, pas qui
-- finit celle qui roule.
create or replace function public.maj_position(
  p_lat double precision,
  p_lon double precision,
  p_en_ligne boolean default true,
  p_cap smallint default null
)
returns public.positions_conducteurs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_position public.positions_conducteurs;
begin
  if v_uid is null then
    raise exception 'non_authentifie' using errcode = 'P0001';
  end if;

  if p_en_ligne
     and not public.est_conducteur(v_uid)
     and not exists (
       select 1 from public.rides r
       where r.conducteur_id = v_uid
         and r.statut not in ('terminee', 'annulee')
     )
  then
    raise exception 'dossier_incomplet'
      using errcode = 'P0001',
            detail = 'Passer en ligne demande un dossier validé et un véhicule actif.';
  end if;

  insert into public.positions_conducteurs
    (conducteur_id, lat, lon, en_ligne, cap, maj_le)
  values (v_uid, p_lat, p_lon, p_en_ligne, p_cap, now())
  on conflict (conducteur_id) do update
    set lat = excluded.lat,
        lon = excluded.lon,
        en_ligne = excluded.en_ligne,
        cap = coalesce(excluded.cap, public.positions_conducteurs.cap),
        maj_le = now()
  returning * into v_position;

  return v_position;
end;
$$;

comment on function public.maj_position(double precision, double precision, boolean, smallint) is
  'Publie la position du conducteur. Passer EN LIGNE exige est_conducteur() — ou une course en cours, qu''on ne coupe pas sous les pieds du passager. Passer HORS LIGNE n''est jamais refusé.';

-- ======================================== UN REFUS ÉTEINT LE BOUTON
-- `decider_document()` retirait la capacité sans toucher à `en_ligne`. Le
-- conducteur restait donc affiché en ligne, une file vide sous les yeux, sans
-- rien pour lui dire ce qui s'était passé. Le refus le sort de la ligne — la
-- capacité et l'état visible bougent ensemble ou ils divergent.
create or replace function public.decider_document(
  p_profil uuid,
  p_type public.type_document,
  p_valide boolean,
  p_motif text default null
)
returns public.documents_conducteur
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_doc public.documents_conducteur;
  v_complet boolean;
begin
  if v_uid is not null and not public.est_admin(v_uid) then
    raise exception 'reserve_admin'
      using errcode = 'P0001',
            detail = 'Seul un profil administrateur décide d''un dossier.';
  end if;

  if not p_valide and nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'motif_requis'
      using errcode = 'P0001',
            detail = 'Un refus sans motif ne se corrige pas.';
  end if;

  update public.documents_conducteur
  set statut = (case when p_valide then 'valide' else 'refuse' end)::public.statut_document,
      motif_refus = case when p_valide then null else btrim(p_motif) end,
      decide_le = now()
  where profil_id = p_profil and type = p_type
  returning * into v_doc;

  if v_doc.profil_id is null then
    raise exception 'document_introuvable' using errcode = 'P0001';
  end if;

  insert into public.decisions_documents (profil_id, type, decide_par, valide, motif)
  values (p_profil, p_type, coalesce(v_uid, p_profil), p_valide,
          case when p_valide then null else btrim(p_motif) end);

  -- LES PIÈCES SONT NOMMÉES, pas comptées.
  select bool_and(exists (
           select 1 from public.documents_conducteur d
           where d.profil_id = p_profil and d.type = t and d.statut = 'valide'))
    into v_complet
  from unnest(array[
    'piece_identite', 'permis', 'carte_grise', 'selfie', 'photo_vehicule'
  ]::public.type_document[]) t;

  update public.profiles
  set documents_valides_le = case when v_complet then now() else null end
  where id = p_profil;

  -- Il perd la capacité : il quitte la ligne. Jamais l'inverse — une pièce
  -- validée ne remet personne en ligne à son insu.
  if not v_complet then
    update public.positions_conducteurs
       set en_ligne = false
     where conducteur_id = p_profil and en_ligne;
  end if;

  return v_doc;
end;
$$;

-- ================================== LES FANTÔMES DÉJÀ EN LIGNE
-- Ceux qui sont passés par la porte ouverte, ou qui ont perdu la capacité
-- pendant qu'ils attendaient. Ils redeviendront visibles dès qu'ils rappuieront
-- sur GO — avec un dossier complet, cette fois.
update public.positions_conducteurs pc
   set en_ligne = false
 where pc.en_ligne
   and not public.est_conducteur(pc.conducteur_id);
