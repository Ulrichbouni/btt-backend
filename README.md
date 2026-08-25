# BTT-LUX — Backend API

API REST de la plateforme BTT-LUX : authentification, catalogue & calculateur, devis, missions technicien, chantiers, paiements mobile money, assistant IA et notifications.

**Stack :** Node.js ≥ 18 · Express 4 · PostgreSQL (pg) · JWT · zod · bcrypt · speakeasy (2FA) · Twilio (WhatsApp/OTP) · Campay (paiements mobile money)

---

## Structure

```
routes/         Endpoints HTTP (auth, devis, paiements, missions, …)
services/       Intégrations externes (Campay, WhatsApp, OTP)
middleware/     Auth JWT, validation zod, rôles
scripts/        initDb.js (schéma DDL), seed.js (admin + produits démo)
schema.sql      Structure de la base (DDL uniquement, idempotent)
server.js       Point d'entrée Express
db.js           Pool PostgreSQL
__tests__/      Tests unitaires + intégration (Jest + Supertest)
```

## Démarrage local

```bash
npm install
cp .env.example .env        # puis remplir DATABASE_URL, JWT_SECRET, …
npm run db:init             # applique schema.sql (DDL uniquement)
# Création admin + produits de démo (exige ADMIN_PASSWORD ≥ 12 caractères)
$env:ADMIN_EMAIL="admin@btt-lux.com"
$env:ADMIN_PASSWORD="UnSuperMotDePasseFort!123"
npm run db:seed
npm run dev                 # http://localhost:5000/api
```

## Endpoints principaux

| Module | Route | Description |
|--------|-------|-------------|
| Santé | `GET /api/health` | Statut serveur + connexion PostgreSQL (utilisé par Render/Docker) |
| Auth | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` | Inscription, connexion JWT (24 h), profil |
| OTP 2FA | `POST /api/otp/*` | Activation/vérification TOTP (speakeasy) |
| Catalogue | `GET /api/products` | Produits Luxerboard |
| Calculateur | `POST /api/calculator/*` | Estimation besoins/côuts |
| Devis | `POST /api/devis` · `GET /api/devis` | Demande & suivi de devis |
| Chantiers | `GET/POST /api/chantiers/*` | Suivi de chantier (historique JSONB) |
| Missions | `GET/POST /api/missions/*` | Missions technicien + mesures terrain |
| Paiements | `POST /api/paiements/initier` · `POST /api/paiements/webhook` | **Campay** (mobile money), webhook sécurisé clé |
| Assistant | `POST /api/assistant/*` | IA via OpenRouter |
| Notifications | `GET/POST /api/notifications/*` | Notifications utilisateur |
| Admin | `/api/admin/*` | Supervision (rôle `admin`) |

## Tests

```bash
npm test                    # unitaires + intégration, couverture minimale 70 %
npm run test:unit           # tests unitaires (sans DB)
npm run test:integration    # tests d'intégration (nécessite une PostgreSQL)
```

## CI/CD

`.github/workflows/ci.yml` exécute sur chaque push vers `main` :
**scan de secrets (Gitleaks)** → **tests unitaires** (aucune DB requise) → `node --check`.

Les **tests d'intégration** (DB réelle) sont volontairement exclus de la CI : à exécuter en local après `db:init` + `db:seed`.

## Déploiement (Render)

1. Connectez ce repo sur Render (Root Directory = racine, c'est le repo backend).
2. `render.yaml` fournit la configuration (web + PostgreSQL `btt-db`, healthcheck `/api/health`).
3. Renseignez les variables dans le dashboard (cf. `.env.example`) : `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `CAMPAY_*`, `TWILIO_*`, `OPENROUTER_API_KEY`.
4. **Base existante** : une mise à jour du schéma peut nécessiter une migration manuelle (ex. `ALTER TABLE paiements RENAME COLUMN notchpay_data TO payment_data;`) — voir `CHANGELOG.md`.

## Sécurité

- Requêtes SQL paramétrées (pg) — protection injection.
- Validation des entrées `zod` (corps + paramètres d'URL).
- `helmet`, CORS restreint à `FRONTEND_URL`, rate limiting global + strict sur `/api/auth`.
- bcrypt (coût 10) + 2FA optionnel (TOTP).
- Aucun admin créé par le schéma (obligatoire via `npm run db:seed` + `ADMIN_PASSWORD`).

## Licence

MIT — voir le fichier `LICENSE` à la racine du projet.