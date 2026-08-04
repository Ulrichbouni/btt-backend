import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Import des routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import productsRoutes from './routes/products.js';
import calculatorRoutes from './routes/calculator.js';
import missionsRoutes from './routes/missions.js';
import otpRoutes from './routes/otp.js';
import professionnelsRoutes from './routes/professionnels.js';
import devisRoutes from './routes/devis.js';
import chantiersRoutes from './routes/chantiers.js';
import paiementsRoutes from './routes/paiements.js';
import assistantRoutes from './routes/assistant.js';

dotenv.config();

const app = express();

// --- Middleware CORS (à restreindre en production) ---
// En production, remplacez '*' par l'URL de votre frontend Vercel
app.use(cors({ origin: '*' }));

// --- Middleware pour parser le JSON ---
app.use(express.json());

// --- Routes publiques ---
app.get('/', (req, res) => {
  res.send('🚀 BTT API fonctionne');
});

// --- Routes d'authentification ---
app.use('/api/auth', authRoutes);

// --- Routes Admin (gestion des devis, missions, etc.) ---
app.use('/api/admin', adminRoutes);

// --- Routes Produits (catalogue) ---
app.use('/api/products', productsRoutes);

// --- Routes Calculateur ---
app.use('/api/calculator', calculatorRoutes);

// --- Routes Missions technicien ---
app.use('/api/missions', missionsRoutes);

// --- Routes OTP (2FA) ---
app.use('/api/otp', otpRoutes);

// --- Routes Professionnels BTP ---
app.use('/api/professionnels', professionnelsRoutes);

// --- Routes Devis (demande et suivi) ---
app.use('/api/devis', devisRoutes);

// --- Routes Chantiers ---
app.use('/api/chantiers', chantiersRoutes);

// --- Routes Paiements ---
app.use('/api/paiements', paiementsRoutes);

// --- Routes Assistant IA (OpenRouter) ---
app.use('/api/assistant', assistantRoutes);

// --- Gestion des erreurs 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// --- Démarrage du serveur ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Serveur BTT démarré sur le port ${PORT}`);
});