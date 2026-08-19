# Réparer l'historique des migrations après un `supabase link`

## Le problème

Les migrations ont été appliquées sur le projet distant `gwnprkzzyfnryltdcpzk` **par le
serveur MCP Supabase**, qui pose ses propres horodatages. Les versions enregistrées
là-bas ne correspondent donc pas aux noms de fichiers de `supabase/migrations/`.

Conséquence : après un `supabase link`, la CLI compare les deux listes, ne reconnaît
aucune version locale, et **`supabase db push` essaie de tout rejouer**. Ça échoue sur le
premier `create type` déjà présent — et selon l'ordre, ça peut laisser le distant dans un
état à moitié appliqué.

## Le remède

Après `supabase link --project-ref gwnprkzzyfnryltdcpzk`, déclarer chaque migration
locale comme déjà appliquée, **avant tout `db push`** :

```bash
supabase migration repair --status applied 20260818230000  # types_et_tables
supabase migration repair --status applied 20260818230100  # zone_et_durees
supabase migration repair --status applied 20260818230200  # rls
supabase migration repair --status applied 20260818230300  # vues_publiques
supabase migration repair --status applied 20260818230400  # fonctions_negociation
supabase migration repair --status applied 20260818230500  # realtime
supabase migration repair --status applied 20260819090000  # postgis_geographie
supabase migration repair --status applied 20260819090100  # capacite_conducteur
supabase migration repair --status applied 20260819090200  # communes
supabase migration repair --status applied 20260819090300  # appariement
supabase migration repair --status applied 20260819090400  # cron_expire_stale
supabase migration repair --status applied 20260819181000  # search_path_fonctions
```

Puis retirer les versions posées par le MCP, qui font doublon :

```bash
for v in 20260819175702 20260819175726 20260819175756 20260819175822 \
         20260819175920 20260819175930 20260819180002 20260819180040 \
         20260819180119 20260819180146 20260819180203 20260819181?????; do
  supabase migration repair --status reverted "$v"
done
```

Vérifier avant de pousser quoi que ce soit :

```bash
supabase migration list   # local et distant doivent afficher les mêmes versions
```

## Correspondance MCP → fichier

| Version distante (MCP) | Fichier local |
|---|---|
| 20260819175702 | 20260818230000_types_et_tables.sql |
| 20260819175726 | 20260818230100_zone_et_durees.sql |
| 20260819175756 | 20260818230200_rls.sql |
| 20260819175822 | 20260818230300_vues_publiques.sql |
| 20260819175920 | 20260818230400_fonctions_negociation.sql |
| 20260819175930 | 20260818230500_realtime.sql |
| 20260819180002 | 20260819090000_postgis_geographie.sql |
| 20260819180040 | 20260819090100_capacite_conducteur.sql |
| 20260819180119 | 20260819090200_communes.sql |
| 20260819180146 | 20260819090300_appariement.sql |
| 20260819180203 | 20260819090400_cron_expire_stale.sql |
| (search_path) | 20260819181000_search_path_fonctions.sql |
| (profil) | 20260819190000_profil_a_l_inscription.sql |
| (tarif) | 20260819200000_tarif_de_reference.sql |
| (offres) | 20260819210000_offres_recues.sql |
| (tarifs) | 20260819220000_tarifs_provisoires.sql |

## Tant que ce n'est pas fait

**On applique par le serveur MCP**, pas par `db push`. Chaque nouvelle migration : écrire
le fichier dans `supabase/migrations/`, l'appliquer en local par `pnpm db:reset`, puis
l'appliquer sur le distant par `apply_migration` — et ajouter sa ligne au tableau
ci-dessus.
