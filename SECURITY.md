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