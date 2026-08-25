# Changelog

Tous les changements notables du projet BTT-LUX.

Le format respecte [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) et le versioning [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Ajouté
- Endpoint de santé `/api/health` (vérifie la connexion PostgreSQL).
- Scripts de seed idempotents `npm run db:seed` (création d'admin sécurisée + produits démo).
- Fichiers `SUPPORT` de niveau production : README complet, LICENSE (MIT), SECURITY.md, CONTRIBUTING.md, CHANGELOG, `.env.example` (backend/frontend/mobile), `.nvmrc`.
- Pipeline CI/CD (`.github/workflows/ci.yml`) : scan de secrets (Gitleaks), tests backend + build frontend.
- Headers de sécurité supplémentaires sur le frontend (Referrer-Policy, Permissions-Policy) et cache immuable des assets.

### Changed
- `schema.sql` : ne contient plus que le DDL (plus de compte admin à mot de passe connu ni de seed produits en dur). Le fichier est désormais en UTF-8.
- `vercel.json` : retrait de l'URL `VITE_API_URL` hardcodée (à définir dans le projet Vercel).
- `server.js` : activation de `trust proxy` (fiabilité de `req.ip`, rate limiting et cookies derrière proxy).

### Fixed
- `jest.config.js` : suppression d'un bloc dupliqué invalide qui provoquait l'échec de `npm test`.
- `middleware/validation.js` : correction du bug zod v4 (`error.errors` → `error.issues`) qui plantait les réponses d'erreur de validation en production.

### Removed
- **NotchPay** retiré des paiements : dépendance `notchpay.js` désinstallée, `services/notchpay.js` supprimé, variables `NOTCHPAY_*` retirées (`.env.example`, `render.yaml`), colonne `notchpay_data` renommée **`payment_data`**. Les paiements passent désormais exclusivement par **Campay**.
  - ⚠️ Base déjà déployée : exécuter `ALTER TABLE paiements RENAME COLUMN notchpay_data TO payment_data;`

### Autre
- `docker-compose.yml` : réécrit en orchestration mono-dossier propre (variables explicites, healthcheck sur `/api/health`, PostgreSQL optionnelle via le profil `db`, pas d'exposition de port inutile).
- `btt-frontend/Dockerfile` : ajout du build arg `VITE_API_URL` pour pouvoir injecter l'URL de l'API au build (nginx agit par défaut en reverse-proxy vers `backend:5000`).
- README dédié ajouté pour `btt-backend` (endpoints, tests, déploiement Render) et `btt-frontend` (routes, variables, déploiement Vercel) ; README `btt-mobile` complété (`.env.example`).

## [1.0.0] - 2025
- Version initiale : catalogue, calculateur, devis, missions technicien, chantiers, paiements, OTP 2FA, assistant IA, notifications.