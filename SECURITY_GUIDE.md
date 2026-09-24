# 🔒 Guide de Sécurité - BTT Backend

## Checklist de déploiement sécurisé

### ✅ Avant le déploiement

- [ ] Audit de sécurité : `npm audit fix`
- [ ] Toutes les dépendances à jour : `npm outdated`
- [ ] Variables d'environnement validées (voir `config.js`)
- [ ] JWT_SECRET ≥ 32 caractères aléatoires
- [ ] ADMIN_PASSWORD ≥ 12 caractères avec complexité
- [ ] CAMPAY_WEBHOOK_SECRET défini (pour validation webhook)
- [ ] Tests passent : `npm test`
- [ ] Pas de secrets dans le code : `git secrets --scan`

### 🛡️ Configuration de production

#### Variables d'environnement obligatoires

```bash
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://user:pass@host:5432/database
JWT_SECRET=<générer avec: openssl rand -base64 48>
FRONTEND_URL=https://votre-domaine.com
```

#### Variables optionnelles (mais recommandées)

```bash
# Email
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=noreply@votre-domaine.com
EMAIL_PASS=<mot-de-passe-app>
EMAIL_FROM=BTT-LUX <noreply@votre-domaine.com>

# Twilio (SMS/WhatsApp)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+237...
TWILIO_WHATSAPP_NUMBER=whatsapp:+237...

# Campay (paiements)
CAMPAY_USERNAME=...
CAMPAY_PASSWORD=...
CAMPAY_API_URL=https://api.campay.net
CAMPAY_WEBHOOK_SECRET=<générer aléatoire>

# OpenRouter (IA)
OPENROUTER_API_KEY=sk-or-v1-...

# Sécurité (optionnel, valeurs par défaut)
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 🔐 Génération de secrets sécurisés

```bash
# JWT Secret (≥32 caractères)
openssl rand -base64 48

# CAMPAY Webhook Secret
openssl rand -hex 32

# Admin password fort
pwgen -s 16 1
```

### 🚨 Configuration Nginx/Reverse Proxy

```nginx
# Configuration recommandée pour Nginx
server {
    listen 443 ssl http2;
    server_name api.votre-domaine.com;

    # SSL/TLS
    ssl_certificate /etc/letsencrypt/live/api.votre-domaine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.votre-domaine.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Headers de sécurité
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Limite de taille des uploads
    client_max_body_size 10M;

    # Proxy vers Node.js
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Healthcheck (pas de logs)
    location /api/health {
        proxy_pass http://localhost:5000;
        access_log off;
    }
}
```

### 🗄️ Sécurité PostgreSQL

```sql
-- Créer un utilisateur dédié (pas de superuser)
CREATE USER btt_app WITH PASSWORD 'mot-de-passe-fort';
GRANT CONNECT ON DATABASE btt_production TO btt_app;
GRANT USAGE ON SCHEMA public TO btt_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO btt_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO btt_app;

-- Définir les permissions par défaut
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO btt_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO btt_app;

-- Sauvegardes quotidiennes automatiques
-- Configurer via Render/AWS RDS/provider
```

### 🔄 Rotation des secrets

**JWT_SECRET** : Rotation tous les 6 mois minimum
- Déployer nouvelle version avec nouveau secret
- Forcer reconnexion des utilisateurs
- Invalider anciens tokens

**API Keys** : Rotation annuelle minimum
- Campay, Twilio, OpenRouter
- Tester en staging avant prod

### 📊 Monitoring de sécurité

#### Métriques à surveiller

1. **Tentatives de connexion échouées** : > 10/min = alerte
2. **Rate limiting déclenchés** : > 50/heure = possible attaque
3. **Erreurs 5xx** : > 5% des requêtes = investigation
4. **Requêtes webhook invalides** : > 10/jour = possible scan

#### Logs de sécurité

```bash
# Surveiller les patterns suspects
tail -f /var/log/btt-backend/security.log | grep -E "AUTH_FAILED|RATE_LIMIT|CSRF"
```

### 🚫 Interdictions strictes

❌ **Ne JAMAIS** :
- Commiter des `.env` ou fichiers de log
- Utiliser `console.log()` pour des données sensibles
- Exposer les stack traces en production
- Désactiver Helmet ou CORS en production
- Utiliser `admin`/`password` comme credentials
- Stocker des mots de passe en clair
- Exposer les routes admin sans authentification

### 🔍 Audit régulier

```bash
# Mensuellement
npm audit
npm outdated
npx snyk test  # Si compte Snyk configuré

# Avant chaque déploiement majeur
npm run test
git secrets --scan
```

### 📞 Procédure d'incident de sécurité

1. **Détection** : Monitoring, logs, rapport utilisateur
2. **Isolation** : Désactiver le service compromis
3. **Investigation** : Analyser les logs d'accès
4. **Remédiation** : Patcher la vulnérabilité
5. **Rotation** : Changer tous les secrets potentiellement compromis
6. **Communication** : Informer les utilisateurs si données exposées
7. **Post-mortem** : Documenter l'incident et les actions

### 📚 Ressources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

---

**Dernière mise à jour** : 2026-09-24
**Responsable sécurité** : DevOps Team
