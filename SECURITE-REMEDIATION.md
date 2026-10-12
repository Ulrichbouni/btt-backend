# Remédiation de sécurité — actions manuelles

Suite à l'audit, deux points **critiques** restent à traiter hors code
(backend de production et build signé). Ce document donne la procédure exacte.

---

## 🔴 #1 — Révoquer le jeton JWT fuité (`%TOKFILE%`)

Le fichier `%TOKFILE%` contenait un JWT de l'**admin**. Il a été supprimé du
disque, mais le jeton reste valide tant qu'il n'est pas révoqué côté serveur.

### Mécanisme
Le backend embarque un claim `auth_version` dans chaque JWT. Le middleware
`verifyToken` (btt-backend/middleware/auth.js) rejette tout jeton dont
`auth_version` ne correspond plus à la valeur en base. **Incrémenter
`auth_version` révoque donc chirurgicalement les anciens jetons de ce seul
compte**, sans redéploiement et sans déconnecter les autres utilisateurs.

### ⚠️ Piège majeur : la base visée
Le `.env` local pointe sur une base **Neon (dev)**, PAS la base de production
Render. Exécuter le script en l'état révoquerait la base de **dev** : le jeton
fuité resterait actif en production. Il faut donc réécrire `DATABASE_URL` avec
l'URL de la base de **production** (Render Dashboard → votre PostgreSQL →
*Internal* ou *External Database URL*).

### Procédure (révocation chirurgicale — recommandée)

```powershell
cd d:\agence-IA\gestion\btt-backend

# 1. Pointe sur la base de PRODUCTION et cible le compte admin fuité
$env:DATABASE_URL = "<External Database URL Render>"
$env:ADMIN_EMAIL    = "admin@btt-lux.com"

# 2. Révoque (le script affiche l'hôte visé AVANT d'écrire — vérifiez-le)
node revoke-sessions.mjs

# 3. Nettoie l'environnement
Remove-Item Env:\ADMIN_EMAIL
Remove-Item Env:\DATABASE_URL
```

Sortie attendue :
```
🎯 Base visée : <hote-render-postgres>
👤 Compte    : admin@btt-lux.com
✅ Sessions révoquées pour admin@btt-lux.com (admin, id=…).
   Nouvelle auth_version = N.  Tous les JWT émis avant cette bascule sont rejetés.
```

### Variante nucléaire (optionnelle)
Si vous préférez **tout** révoquer d'un coup (tous les utilisateurs, toutes
sessions), faites tourner `JWT_SECRET` avec l'assistant existant :

```powershell
cd d:\agence-IA\gestion
.\rotate_part1.ps1 -UpdateLocalEnv      # partie 1 (génère le nouveau secret)
.\rotate_part2.ps1                      # partie 2 (guide les dashboards)
```
Puis mettez à jour `JWT_SECRET` dans Render → *Environment* → *Save*
(redéploiement automatique). **Effet de bord :** tous les utilisateurs seront
déconnectés et devront se reconnecter. À réserver si la révocation chirurgicale
ne suffit pas.

### Vérification
Après révocation, tentez un appel avec l'ancien token → doit renvoyer `401`.
Reconnectez-vous via l'app → un nouveau token (bonne `auth_version`) est émis.

---

## 🟠 #2 — Reconstruire l'APK/AAB de release conforme

L'artefact actuel est **non publiable** :
- signé avec la clé **Android Debug** (`CN=Android Debug`),
- `versionCode=1 / versionName=1.0.0` (attendu **4 / 1.2.0**),
- `devCredentialCheck.ok=false` (pas de bundle JS embarqué).

`app.json` est **déjà correct** (`"version": "1.2.0"`, `"versionCode": 4`) —
aucune modification nécessaire. Le problème vient de la **méthode de build** :
le script `prepare-release-apk.js` fabrique un APK *factice* (copie du debug).

### Bonne pratique : builder via EAS avec les credentials de production

```powershell
cd d:\agence-IA\gestion\btt-mobile

# Connexion EAS (compte propriétaire du projet 0762c5a4-…)
npx eas-cli login

# Build AAB (Google Play) — profil production de eas.json
npx eas-cli build -p android --profile production

# OU build APK (distribution directe / sideload) — profil preview
npx eas-cli build -p android --profile preview
```

EAS gère automatiquement la **clé de signature de production** (upload key
+ app signing key). Ne signez **jamais** un APK de release avec la clé debug :
Google Play le rejetterait et la clé debug est publique.

### Vérification post-build
Une fois l'artefact téléchargé depuis EAS, relancez les vérifications :

```powershell
npm run verify:release        # attendu : signature prod, versionCode 4, credentials OK
npm run verify:prod-bundle    # attendu : aucun identifiant dev dans le bundle
```

L'artefact n'est publiable que si les deux passent au vert.

---

## Récapitulatif

| # | Action | Où | Fait ? |
|---|--------|-----|--------|
| 1 | Révoquer le JWT fuité (`auth_version++` sur la base de **prod**) | Render DB + `revoke-sessions.mjs` | ☐ |
| 2 | Rebuild release signé clé de prod (v1.2 / code 4) | EAS | ☐ |
