import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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
import notificationsRoutes from './routes/notifications.js';
import uploadsRoutes from './routes/uploads.js';
import { getDevisPDF } from './services/pdf.js';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import pool from './db.js';
import { verifyToken } from './middleware/auth.js';

dotenv.config();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Derrière Render/Vercel/reverse-proxy : faire confiance au 1er proxy
// pour que req.ip, les rate-limiters et les cookies Secure soient exacts.
app.set('trust proxy', 1);

// --- Security Headers ---
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// --- Rate Limiting ---
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Rate limiting plus strict pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes.' }
});

// --- Middleware CORS sécurisé ---
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || 'https://votre-domaine.com'
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// --- Middleware pour parser le JSON ---
app.use(express.json());

// --- Routes publiques ---
app.get('/', (req, res) => {
  res.send('🚀 BTT API fonctionne');
});

// --- Healthcheck (utilisé par Render, Docker et les uptime checks) ---
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Healthcheck DB KO:', err.message);
    res.status(503).json({ status: 'degraded', db: 'down', timestamp: new Date().toISOString() });
  }
});

// --- Routes d'authentification (avec rate limiting strict) ---
app.use('/api/auth', authLimiter, authRoutes);

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

// --- Routes Notifications ---
app.use('/api/notifications', notificationsRoutes);

// --- Routes Upload ---
app.use('/api/uploads', uploadsRoutes);

// --- Fichiers statiques uploads ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Export PDF d'un devis (client/admin) ---
app.get('/api/devis/:id/pdf', verifyToken, async (req, res) => {
  const { id } = req.params;
  try {
    const dev = await pool.query('SELECT * FROM devis WHERE id = $1', [id]);
    if (!dev.rows.length) return res.status(404).json({ error: 'Devis introuvable' });
    if (dev.rows[0].utilisateur_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const buffer = await getDevisPDF(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="devis-${id}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'Erreur génération PDF' });
  }
});

// --- Gestion des erreurs 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// --- Middleware global des erreurs ---
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// --- Démarrage du serveur (uniquement si lancé directement) ---
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✅ Serveur BTT démarré sur le port ${PORT}`);
  });
}

export default app;