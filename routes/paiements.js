import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
const router = express.Router();

// Simuler un paiement
router.post('/simuler', verifyToken, async (req, res) => {
  const { devis_id, montant, methode, telephone, num_carte, expiration, cvc } = req.body;
  
  // Simuler un traitement (délai aléatoire)
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
  
  // Générer une référence unique
  const reference = `BTT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Sauvegarder dans l'historique
  await pool.query(
    `INSERT INTO paiements (utilisateur_id, devis_id, methode, montant, reference, statut) 
     VALUES ($1,$2,$3,$4,$5,'simule')`,
    [req.user.id, devis_id || null, methode, montant, reference]
  );
  
  res.json({
    success: true,
    reference,
    montant,
    methode,
    message: '✅ Paiement simulé avec succès (intégration réelle à prévoir)'
  });
});

// Historique des paiements
router.get('/historique', verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM paiements WHERE utilisateur_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Admin: Tous les paiements
router.get('/admin/tous', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const result = await pool.query(
    `SELECT p.*, u.nom as utilisateur_nom 
     FROM paiements p 
     JOIN utilisateurs u ON p.utilisateur_id = u.id 
     ORDER BY p.created_at DESC`
  );
  res.json(result.rows);
});

export default router;