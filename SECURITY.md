# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main    | ✅ Yes    |

## Reporting a Vulnerability

Merci de ne PAS ouvrir d'issue publique pour une vulnérabilité.

**Envoyez un rapport privé** à l'équipe (email du mainteneur) ou via le mécanisme
« Report a vulnerability » de GitHub, en incluant :
- la version (commit/hash),
- le composant affecté,
- une description et si possible une reproduction.

Nous accuserons réception sous 72 h et répondrons avec un plan de correction.

## Bonnes pratiques déjà en place
- Base de données : requêtes paramétrées (pg) → protection injection SQL.
- Validation des entrées : `zod` (register/login).
- Headers : `helmet`, CORS restreint à `FRONTEND_URL`.
- Rate limiting : global + strict sur les routes d'authentification.
- Mots de passe : `bcrypt` (coût 10), 2FA TOTP (speakeasy) optionnel.
- Secrets : jamais commités (`.env` ignoré), scan automatique en CI (Gitleaks).
- Password par défaut : aucun admin n'est créé par le schéma (`npm run db:seed` l'exige).

## ⚠️ Avis de sécurité important (juillet 2026)

Le fichier `.env` contenant de **vrais secrets** (JWT_SECRET, clés Twilio + Campay)
a été **commité par erreur dans l'historique Git** des dépôts `btt-backend` et
`btt-frontend`. L'historique a depuis été **réécrit** (purge de `.env` et de
`node_modules`) et les branches `main` poussées par force sur GitHub.

**Action obligatoire :**
1. **ROTEZ TOUS les secrets exposés** — ils peuvent avoir été lus :
   - `JWT_SECRET` → régénérer (`openssl rand -hex 32`) et mettre à jour sur Render.
   - `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SERVICE_SID`
     → régénérer côté console Twilio.
   - `CAMPAY_APP_ID` / `CAMPAY_USERNAME` / `CAMPAY_PASSWORD` /
     `CAMPAY_ACCESS_TOKEN` / `CAMPAY_WEBHOOK_KEY` → régénérer côté Campay.
   - `DATABASE_URL` → si possible, changer le mot de passe du rôle PostgreSQL.
2. Si les dépôts sont publics : signaler la compromission à GitHub (les anciens
   commits peuvent rester accessibles par hash tant que GitHub ne les a pas purgés).
3. Ne jamais réutiliser ces secrets.