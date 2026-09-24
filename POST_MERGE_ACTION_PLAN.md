# 📋 Plan d'Action Post-Merge

## Vue d'ensemble

Ce document récapitule toutes les actions à effectuer après avoir mergé les Pull Requests d'amélioration.

---

## 🔒 Backend (btt-backend)

### 1. Installation et configuration

```bash
cd btt-backend
npm install
```

### 2. Validation de la configuration

```bash
# Vérifier que toutes les variables d'environnement sont valides
node config.js

# Si erreurs, corriger le fichier .env
cp .env.example .env
# Puis remplir les valeurs
```

### 3. Intégration des middlewares de sécurité

**Éditer `server.js` :**

```js
import { 
  securityHeaders, 
  requestTimeout, 
  sanitizeInput,
  apiLimiter,
  strictAuthLimiter 
} from './middleware/security.js';

// Après helmet() et avant les routes
app.use(securityHeaders);
app.use(requestTimeout(30000)); // 30 secondes
app.use(sanitizeInput);

// Remplacer le rate limiter existant
app.use('/api/', apiLimiter);
app.use('/api/auth', strictAuthLimiter, authRoutes);
```

### 4. Nettoyage de l'historique Git (OPTIONNEL mais recommandé)

⚠️ **ATTENTION** : Cette opération réécrit l'historique. À faire en collaboration.

```bash
# Backup d'abord
git clone https://github.com/Ulrichbouni/btt-backend.git btt-backend-backup

# Supprimer les fichiers sensibles de l'historique
cd btt-backend
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch _*.log _*.err _*.txt apk-build.log" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (coordonner avec l'équipe)
git push origin --force --all
git push origin --force --tags
```

### 5. Tests

```bash
npm run db:init
npm run db:seed
npm test
npm start

# Vérifier manuellement :
curl http://localhost:5000/api/health
```

### 6. Déploiement Render

1. Aller sur dashboard Render
2. Déclencher un nouveau déploiement
3. Vérifier les logs
4. Tester l'API en production

---

## ⚡ Frontend (btt-frontend)

### 1. Installation

```bash
cd btt-frontend
npm install
```

### 2. Intégration de l'ErrorBoundary

**Éditer `src/main.jsx` ou `src/App.jsx` :**

```jsx
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* Votre contenu existant */}
      </BrowserRouter>
    </ErrorBoundary>
  );
}
```

### 3. Implémentation du lazy loading

**Créer un nouveau fichier `src/App.optimized.jsx` :**

```jsx
import { lazy, Suspense } from 'react';
import LazyLoadFallback from './components/Loading';

// Pages critiques (chargées immédiatement)
import Accueil from './pages/Accueil';
import Login from './pages/Login';

// Lazy load des pages secondaires
const Admin = lazy(() => import('./pages/Admin/Dashboard'));
const Catalogue = lazy(() => import('./pages/Catalogue'));
const DemandeDevis = lazy(() => import('./pages/DemandeDevis'));
const Calculateur = lazy(() => import('./pages/Calculateur'));
const AssistantIA = lazy(() => import('./pages/AssistantIA'));

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LazyLoadFallback />}>
          <Routes>
            <Route path="/" element={<Accueil />} />
            <Route path="/login" element={<Login />} />
            <Route path="/catalogue" element={<Catalogue />} />
            <Route path="/calculateur" element={<Calculateur />} />
            <Route path="/devis" element={<DemandeDevis />} />
            <Route path="/assistant" element={<AssistantIA />} />
            <Route path="/admin/*" element={<Admin />} />
            {/* Autres routes... */}
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
```

### 4. Tests

```bash
# Lancer les tests
npm test

# Avec UI interactive
npm run test:ui

# Avec coverage
npm run test:coverage
```

### 5. Analyse du bundle

```bash
npm install -D rollup-plugin-visualizer

# Ajouter dans vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true, gzipSize: true })
  ]
});

# Build et analyser
npm run build
# Ouvre automatiquement stats.html
```

### 6. Déploiement Vercel

```bash
# Si pas encore installé
npm install -g vercel

# Déployer
vercel --prod

# Ou via Git (push vers main)
git push origin main
```

### 7. Configuration des variables d'environnement Vercel

1. Aller sur dashboard Vercel
2. Settings > Environment Variables
3. Ajouter :
   - `VITE_API_URL` = `https://votre-backend.onrender.com/api`

---

## 📱 Mobile (btt-mobile)

### 1. Installation

```bash
cd btt-mobile
npm install
npx expo install expo-secure-store
```

### 2. Création du service d'authentification sécurisé

**Créer `src/services/authService.js` :**

```js
import * as SecureStore from 'expo-secure-store';

export const AuthService = {
  async saveToken(token) {
    try {
      await SecureStore.setItemAsync('jwt_token', token);
      return true;
    } catch (error) {
      console.error('Erreur sauvegarde token:', error);
      return false;
    }
  },

  async getToken() {
    try {
      return await SecureStore.getItemAsync('jwt_token');
    } catch (error) {
      console.error('Erreur lecture token:', error);
      return null;
    }
  },

  async removeToken() {
    try {
      await SecureStore.deleteItemAsync('jwt_token');
      return true;
    } catch (error) {
      console.error('Erreur suppression token:', error);
      return false;
    }
  },

  async isAuthenticated() {
    const token = await this.getToken();
    return !!token;
  }
};
```

### 3. Migration des screens

**Éditer `src/screens/LoginScreen.js` :**

```js
import { AuthService } from '../services/authService';

// Remplacer
AsyncStorage.setItem('token', response.data.token);

// Par
await AuthService.saveToken(response.data.token);
```

**Répéter pour tous les screens utilisant AsyncStorage pour le token.**

### 4. Mise à jour du service API

**Éditer `src/services/api.js` :**

```js
import axios from 'axios';
import { AuthService } from './authService';

const api = axios.create({
  baseURL: 'https://votre-backend.onrender.com/api',
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await AuthService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AuthService.removeToken();
      // Navigation.navigate('Login');
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 5. Tests sur device physique

```bash
# Android
npx expo run:android

# iOS (macOS uniquement)
npx expo run:ios
```

### 6. Build de production

```bash
# Installer EAS CLI
npm install -g eas-cli

# Login
eas login

# Configurer
eas build:configure

# Build Android
eas build --platform android --profile production

# Build iOS
eas build --platform ios --profile production
```

### 7. Nettoyage de l'historique (optionnel)

```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch _*.log _*.err _*.txt apk-build.log" \
  --prune-empty -- --all
git push origin --force --all
```

---

## 🎯 Checklist Finale

### Backend
- [ ] Middlewares de sécurité intégrés
- [ ] Config validée avec zod
- [ ] Tests passent
- [ ] Déployé sur Render
- [ ] Healthcheck OK en production

### Frontend
- [ ] ErrorBoundary intégré
- [ ] Lazy loading implémenté
- [ ] Tests coverage ≥ 70%
- [ ] Bundle analysé et optimisé
- [ ] Déployé sur Vercel
- [ ] Variables d'env configurées

### Mobile
- [ ] SecureStore implémenté
- [ ] Migration AsyncStorage → SecureStore
- [ ] Tests sur devices physiques
- [ ] Build production créé
- [ ] Soumis aux stores (optionnel)

---

## 📊 Métriques de succès

### Performance
- [ ] Backend response time < 200ms (moyenne)
- [ ] Frontend LCP < 2.5s
- [ ] Mobile app launch < 3s

### Sécurité
- [ ] `npm audit` : 0 vulnérabilités high/critical
- [ ] Lighthouse security score > 90
- [ ] Tous les secrets hors du code

### Qualité
- [ ] Backend test coverage > 70%
- [ ] Frontend test coverage > 70%
- [ ] 0 erreurs ESLint/Oxlint

---

## 🆘 En cas de problème

### Backend ne démarre pas
```bash
# Vérifier les logs
npm start
# Regarder les erreurs de config
node config.js
```

### Frontend ne build pas
```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Mobile ne lance pas
```bash
# Nettoyer le cache Expo
npx expo start -c
# Réinstaller
rm -rf node_modules
npm install
```

---

**Date de création :** 2026-09-24  
**Auteur :** Corrections automatisées via Ashna-X1
