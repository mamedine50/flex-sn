# Builder ou publier ?

Un build EAS coûte du quota, une file d'attente, et une reconstruction native.
Une mise à jour par-dessus l'air coûte trente secondes et rien d'autre. La
plupart des corrections ne demandent pas de build — encore faut-il savoir
lesquelles.

## La règle

| Ce qui change | Quoi faire |
|---|---|
| Écrans, composants, logique, textes, couleurs, i18n | `eas update` |
| Migrations SQL, fonctions Postgres, policies | **rien** — la base est déjà à jour |
| Fonction de bord (`supabase/functions`) | déploiement Supabase, pas un build |
| Dépendance **native** ajourée ou retirée | **build** |
| `app.json` : greffon, permission, entitlement, icône, splash, bundle | **build** |
| Montée de version du SDK Expo | **build** |

Le test qui tranche : *est-ce que le projet natif change ?* Si oui, build. Sinon,
mise à jour.

## Publier une mise à jour

```bash
eas update --channel test        --message "ce que ça corrige"
eas update --channel production  --message "ce que ça corrige"
```

Les canaux sont déclarés dans `eas.json`, un par profil de build. Un build
n'écoute que le sien : une mise à jour publiée sur `test` n'atteint jamais la
version soumise à Apple, et réciproquement.

## Pourquoi `runtimeVersion` est en `fingerprint`

C'est le réglage qui empêche une mise à jour de **casser** une version installée.

Il était sur `appVersion`, c'est-à-dire `1.0.0` — un nom que TOUTES les versions
installées portent. Publier une mise à jour contenant du code qui appelle
`expo-notifications` l'aurait donc envoyée aussi au build 14, qui n'embarque pas
ce module natif : plantage au lancement, sur les téléphones des testeurs, sans
aucun moyen de réparer à distance.

En `fingerprint`, Expo calcule une empreinte du projet natif. Une mise à jour ne
part **que** vers les builds dont l'empreinte correspond. Les autres l'ignorent
et continuent de tourner. On perd la simplicité d'un numéro lisible ; on gagne
l'impossibilité de casser une version en production.

**Conséquence pratique :** tout changement natif produit une nouvelle empreinte,
donc les builds précédents cessent de recevoir des mises à jour. C'est voulu —
ils ne pourraient pas les exécuter.

## Ce qu'une mise à jour ne répare pas

- **L'icône de l'app.** Elle est native, compilée dans le binaire. Aucune mise à
  jour ne la remplace — c'est ce qui a fait croire que le logo Fx n'était pas
  passé.
- **Les permissions et leurs textes.** Ils vivent dans `Info.plist`.
- **Tout module natif** absent du build installé.
