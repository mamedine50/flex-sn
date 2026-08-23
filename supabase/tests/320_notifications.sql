-- Les notifications : qui les reçoit, qui ne les reçoit pas, et ce qu'elles ne
-- contiennent pas.
--
-- La dernière assertion est la plus importante. Une notification ne porte PAS
-- de phrase. Si un jour quelqu'un ajoute une colonne `texte` pour « simplifier
-- l'écran », l'interface cesse d'être traduisible et un prénom recopié sort du
-- champ des vues publiques — figé, même si la règle change. L'assertion est là
-- pour que ça se voie le jour où ça arrive.
begin;
create extension if not exists pgtap with schema public;

select plan(16);

create function public.t_utilisateur(p_prenom text) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  values (v_id, 'u' || replace(v_id::text, '-', '') || '@flex.test');
  update public.profiles set prenom = p_prenom where id = v_id;
  return v_id;
end; $$;

create function public.t_devenir(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  select null::void;
$$;

create temp table f as
select public.t_utilisateur('Awa') as passagere,
       public.t_utilisateur('Modou') as conducteur,
       public.t_utilisateur('Fatou') as tierce;
grant select on f to authenticated;

insert into public.vehicles (conducteur_id, plaque, modele, couleur)
select conducteur, 'DK-NOTIF-1', 'Kia Picanto', 'grise' from f;
update public.profiles set documents_valides_le = now()
 where id = (select conducteur from f);

-- ════════════ 1. le conducteur propose : la PASSAGÈRE apprend ════════════
select public.t_devenir((select passagere from f));
set local role authenticated;
create temp table d as
select * from public.create_ride_request('urbain', 14.7091, -17.4478, 'Colobane',
                                         14.7074, -17.4744, 'Mermoz', 2000);
grant select on d to authenticated;

select public.t_devenir((select conducteur from f));
create temp table o1 as
select * from public.submit_offer((select id from d), 'contre_offre'::public.type_offre,
                                  2500, 5::smallint);
grant select on o1 to authenticated;

select public.t_devenir((select passagere from f));

select is(
  (select genre::text from public.notifications
    where destinataire_id = (select passagere from f)
    order by cree_le desc limit 1),
  'offre_recue',
  'Le conducteur propose : la passagère reçoit « offre reçue »'
);

select is(
  (select montant_xof from public.notifications
    where destinataire_id = (select passagere from f)
    order by cree_le desc limit 1),
  2500,
  'et le montant est là — c''est LE chiffre qui décide de l''ouvrir'
);

-- ════════════ 2. celui qui agit n'est jamais notifié de son geste ════════
select public.t_devenir((select conducteur from f));
select is(
  (select count(*)::int from public.notifications
    where destinataire_id = (select conducteur from f)),
  0,
  'Le conducteur ne s''auto-notifie pas : il sait ce qu''il vient de faire'
);

-- ════════════ 3. la passagère répond : le CONDUCTEUR apprend ═════════════
-- Le passager ne passe PAS par `submit_offer` — c'est la porte du conducteur.
-- Il répond à une offre précise, par `contre_proposer`.
select public.t_devenir((select passagere from f));
select lives_ok(
  format($$ select public.contre_proposer(%L::uuid, 2200) $$,
         (select id from o1)),
  'La passagère contre-propose'
);

select public.t_devenir((select conducteur from f));
select is(
  (select genre::text from public.notifications
    where destinataire_id = (select conducteur from f)
    order by cree_le desc limit 1),
  'contre_offre',
  'et le conducteur reçoit « contre-offre » — c''est le cas qui a motivé tout ça'
);

-- ════════════ 4. LA TIERCE NE REÇOIT RIEN ════════════════════════════════
select public.t_devenir((select tierce from f));
select is(
  (select count(*)::int from public.notifications),
  0,
  'Une tierce personne ne voit AUCUNE notification — pas même les siennes, elle n''en a pas'
);

-- ════════════ 5. l'accord notifie celui qui n'a pas appuyé ═══════════════
select public.t_devenir((select conducteur from f));
create temp table c as
select * from public.accept_offer(
  (select id from public.offers where demande_id = (select id from d)
     and statut = 'en_attente' order by tour desc limit 1));
grant select on c to authenticated;

select public.t_devenir((select passagere from f));
select is(
  (select genre::text from public.notifications
    where destinataire_id = (select passagere from f)
    order by cree_le desc limit 1),
  'offre_acceptee',
  'Le conducteur accepte : la passagère apprend que c''est conclu'
);

-- ════════════ 5 bis. « votre conducteur est arrivé » ═════════════════════
-- La seule étape du trajet qui vaut une notification : le passager attend
-- DEHORS, téléphone en poche, canal temps réel fermé.
select public.t_devenir((select conducteur from f));
select lives_ok(
  format($$ select public.avancer_course(%L::uuid, 'en_route') $$, (select id from c)),
  'Le conducteur part'
);
select public.t_devenir((select conducteur from f));
select lives_ok(
  format($$ select public.avancer_course(%L::uuid, 'arrive') $$, (select id from c)),
  'puis il signale son arrivée'
);

select public.t_devenir((select passagere from f));
select is(
  (select genre::text from public.notifications
    where destinataire_id = (select passagere from f)
    order by cree_le desc limit 1),
  'conducteur_arrive',
  'et la passagère est prévenue — c''est la notification la plus utile du produit'
);

-- ════════════ 6. un message notifie l'autre, jamais l'expéditeur ═════════
select public.t_devenir((select conducteur from f));
select lives_ok(
  format($$ select public.envoyer_message(%L::uuid, 'Je suis à 3 minutes') $$,
         (select id from c)),
  'Le conducteur écrit'
);

select public.t_devenir((select passagere from f));
select is(
  (select genre::text from public.notifications
    where destinataire_id = (select passagere from f)
    order by cree_le desc limit 1),
  'message',
  'et la passagère est prévenue du message'
);

-- ════════════ 7. marquer lu n'agit que sur SES lignes ════════════════════
-- En DEUX temps : dans un même `select`, les deux sous-requêtes voient le même
-- instantané, et le compte se ferait avant la mise à jour.
select public.t_devenir((select passagere from f));
create temp table marquees as select public.marquer_notifications_lues() as n;

select ok(
  (select n from marquees) > 0
    and (select count(*)::int from public.notifications
          where destinataire_id = (select passagere from f) and lu_le is null) = 0,
  'Marquer lu vide sa propre pastille'
);

-- ════════════ 8. AUCUNE PHRASE EN BASE ═══════════════════════════════════
-- Genre, identifiants, montant. Rien qui ressemble à du texte à afficher.
set local role postgres;
select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications'
      and data_type in ('text', 'character varying')),
  0,
  'La table ne porte AUCUNE colonne de texte — trois langues, et un prénom recopié sort des vues publiques'
);

-- ════════════ 9. UN JETON PUSH NE SE LIT PAR PERSONNE ════════════════════
-- Le posséder permet d'envoyer une notification à quelqu'un. Aucun client n'a
-- de raison d'en voir un — seule la fonction d'envoi, en `service_role`.
select public.t_devenir((select passagere from f));
set local role authenticated;

select lives_ok(
  $$ select public.enregistrer_jeton_push('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios') $$,
  'On enregistre son appareil'
);

select throws_ok(
  $$ select 1 from public.jetons_push $$,
  '42501', 'permission denied for table jetons_push',
  'mais AUCUN jeton ne se lit depuis un client — pas même le sien'
);

select * from finish();
rollback;
