# Publier Flex

Ce que la revue Apple demande, ce qui est déjà en place, et les commandes exactes.

---

## Les deux comptes de test

Ils vivent dans la configuration GoTrue — Authentication → Sign In / Providers →
Phone → *Test phone numbers*. Un numéro de test **n'envoie aucun SMS** et rend
toujours le même code. C'est ce qui permet à un examinateur en Californie
d'ouvrir une session dans une application dont l'authentification passe par un
SMS que Twilio refuse d'envoyer au Sénégal.

| Rôle | Numéro | Code |
|---|---|---|
| Passager Test 0001 | `+1 555 000 0001` | `123456` |
| Conducteur Test 0002 | `+1 555 000 0002` | `123456` |

**Sans le second, la moitié du produit est invisible en revue.** Le monde
conducteur n'apparaît qu'à un compte dont le dossier est validé par un humain :
un examinateur qui n'aurait que le premier compte conclurait qu'il n'y a pas de
côté conducteur.

### Valider Conducteur Test 0002

À lancer **après** avoir créé le numéro de test et ouvert une première session
avec, sinon le compte n'existe pas encore. Le bloc trouve le profil par son
numéro, valide les cinq pièces et pose un véhicule actif.

> **À REJOUER À CHAQUE FOIS QUE LA LISTE DES PIÈCES CHANGE.** Le 22 août 2026,
> la photo du véhicule est devenue la cinquième pièce du dossier. Ce bloc a été
> mis à jour, mais personne ne l'a rejoué : le compte de revue est resté à
> quatre pièces et a PERDU sa capacité de conduire, en silence. Un compte de
> démonstration qui n'est plus conducteur, c'est un rejet d'Apple qu'on découvre
> trois jours plus tard. Le bloc est idempotent — le rejouer ne coûte rien.
>
> Et il n'y a **aucune exception dans le code** pour ce compte, il n'y en aura
> jamais : une branche qui reconnaît un numéro et saute la validation est une
> porte dérobée. Apple lit le binaire, c'est un motif de rejet en soi, et le
> trou survit à la revue. Le compte de revue passe par la même règle que tout le
> monde ; c'est son DOSSIER qu'on prépare, pas la règle qu'on plie.

```sql
-- Flex — faire de Conducteur Test 0002 un conducteur validé.
-- À lancer dans l'éditeur SQL de Supabase, en une fois.
do $$
declare
  v_uid uuid;
  v_type public.type_document;
begin
  select id into v_uid from auth.users where phone = '15550000002';
  if v_uid is null then
    raise exception 'Le compte +15550000002 n''existe pas encore. Ouvrez d''abord une session avec ce numéro dans l''application.';
  end if;

  update public.profiles
     -- `nom_complet` porte le NOM DE FAMILLE, pas le nom entier : l'écran de
     -- profil demande « Nom » et affiche « prénom + nom ». Y mettre
     -- « Conducteur Test » donnait « Conducteur Conducteur Test » au relecteur.
     set prenom = 'Conducteur', nom_complet = 'Test'
   where id = v_uid;

  -- Les quatre pièces. Le chemin pointe vers ce que le compte a déjà envoyé ;
  -- s'il n'a rien envoyé, la ligne est créée avec un chemin de remplissage :
  -- la revue teste le PARCOURS, pas la lisibilité d'un scan.
  foreach v_type in array array['piece_identite','permis','carte_grise','selfie','photo_vehicule']::public.type_document[]
  loop
    insert into public.documents_conducteur (profil_id, type, chemin, statut)
    values (v_uid, v_type, v_uid || '/' || v_type || '.jpg', 'valide')
    on conflict (profil_id, type) do update set statut = 'valide';
  end loop;

  update public.profiles set documents_valides_le = now() where id = v_uid;

  -- Un véhicule actif. `declarer_vehicule()` agit sur auth.uid() : ici on est en
  -- SQL sans session, donc on écrit la ligne directement.
  insert into public.vehicles (conducteur_id, plaque, modele, couleur, actif)
  values (v_uid, 'DK-2026-AR', 'Toyota Corolla', 'blanche', true)
  on conflict do nothing;

  if not public.est_conducteur(v_uid) then
    raise exception 'Le compte n''est toujours pas conducteur — vérifiez les pièces et le véhicule.';
  end if;

  raise notice 'Conducteur Test 0002 est validé : %', v_uid;
end $$;
```

Le bloc **échoue bruyamment** si le compte n'existe pas ou si la validation n'a
pas pris. Un script de préparation de revue qui réussit à moitié est pire que
rien : on ne le découvre qu'au rejet.

### Ce que disent les notes de revue

Déjà écrit dans App Store Connect par `eas metadata:push`. Les identifiants se
posent dans **App Review Information → Sign-In Required**, avec
`+15550000001` comme identifiant et `123456` comme mot de passe.

---

## Les quatre exigences du contenu utilisateur (règle 1.2)

Une évaluation porte un commentaire libre de 500 caractères : Flex tombe donc
sous la règle 1.2, qui demande quatre choses. Les quatre sont en place.

| Exigence | Où |
|---|---|
| Filtrer le contenu grossier | `src/lib/filtreMots.ts`, appliqué à l'affichage des avis |
| Vérifier l'identité | Le selfie tient le permis : l'admin compare visage, permis et photo de profil côte à côte |
| Signaler | Bouton sur un avis reçu et sur une course terminée → `signaler()` |
| Bloquer | Profil → Personnes bloquées ; la règle tient **dans l'appariement** |
| Publier un contact | `site/support.html`, en ligne |

Le filtre **masque à l'affichage**, il ne refuse pas à l'écriture : refuser
apprend à contourner et fait disparaître le texte dont l'équipe a besoin pour
traiter un signalement.

---

## Suppression de compte (règle 5.1.1)

Profil → Compte → **Supprimer mon compte**, avec une confirmation qui nomme ce
qui part et ce qui reste.

L'ordre des opérations est le sujet : on **demande** d'abord si c'est possible,
on efface **ensuite** les fichiers, on supprime **enfin**. Sans la première
étape, on détruirait les pièces d'identité avant de découvrir qu'une course
active interdit la suppression.

Les fichiers partent côté client : Supabase interdit le `delete` direct dans
`storage.objects`, y compris au propriétaire de la base.

Ce qui reste : la ligne de profil, **vidée**. Une course appartient à deux
personnes ; l'effacer priverait la contrepartie de son historique et de ses
gains. Le conducteur d'hier voit « Compte supprimé » à la place d'un nom.

---

## Les commandes

```bash
# Construire
npx eas-cli build --platform ios --profile production

# Envoyer — c'est ICI que la connexion Apple et le 2FA arrivent
npx eas-cli submit --platform ios --profile production --latest

# Métadonnées (titre, description, mots-clés, URL, notes de revue)
npx eas-cli metadata:push
```

`store.config.json` n'est pas versionné : il porte le téléphone et l'adresse de
la personne de contact. Le gabarit est `store.config.example.json`.

---

## Les URL

| Champ | URL |
|---|---|
| Privacy Policy URL | `https://mamedine50.github.io/flex-legal/confidentialite.html` |
| Support URL | `https://mamedine50.github.io/flex-legal/support.html` |
| Marketing URL | `https://mamedine50.github.io/flex-legal/` |

Elles vivent dans le dépôt **`mamedine50/flex-legal`**, public. Le dépôt de
l'application reste privé : publier les pages depuis lui rendrait tout le code
public, GitHub Pages exigeant un dépôt public sur un compte gratuit.

---

## Ce qui reste hors de portée du code

- **Geo Permissions Twilio pour le Sénégal.** Sans elles, aucun testeur
  sénégalais ne reçoit son code. Les comptes de test contournent le problème
  pour la revue, pas pour les vrais utilisateurs.
- **Conditions d'utilisation rédigées par un juriste.** La page publiée est une
  trame et le dit.
- **Entité sénégalaise (NINEA + RCCM)** avant tout compte marchand.
