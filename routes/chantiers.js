import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
const router = express.Router();

// Mes chantiers (client)
router.get('/mes-chantiers', verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, d.ville, d.adresse, d.surface 
     FROM chantiers c 
     JOIN devis d ON c.devis_id = d.id 
     WHERE d.utilisateur_id = $1 
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Détail d'un chantier
router.get('/:id', verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, d.ville, d.adresse, d.surface, d.utilisateur_id, m.technicien_id 
     FROM chantiers c 
     JOIN devis d ON c.devis_id = d.id 
     LEFT JOIN missions_technicien m ON m.devis_id = d.id
     WHERE c.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Chantier non trouvé' });
  const row = result.rows[0];
  const isOwner = row.utilisateur_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  const isAssignedTech = req.user.role === 'technicien' && row.technicien_id === req.user.id;
  if (!isOwner && !isAdmin && !isAssignedTech) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json(row);
});

// Avancer l'étape (admin ou technicien)
router.put('/:id/avancer', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'technicien') {
    return res.status(403).json({ error: 'Admin ou technicien requis' });
  }
  const etapes = ['Devis reçu', 'Visite technique', 'Commande validée', 'Livraison', 'Pose en cours', 'Chantier terminé'];
  const chantier = await pool.query('SELECT etape, historique FROM chantiers WHERE id = $1', [req.params.id]);
  if (!chantier.rows.length) return res.status(404).json({ error: 'Chantier non trouvé' });
  const currentIndex = etapes.indexOf(chantier.rows[0].etape);
  if (currentIndex >= etapes.length - 1) return res.status(400).json({ error: 'Déjà à la dernière étape' });
  const nextEtape = etapes[currentIndex + 1];
  const historique = chantier.rows[0].historique || [];
  historique.push({ date: new Date().toISOString(), action: `Passage à l'étape: ${nextEtape}`, par: req.user.id });
  await pool.query(
    `UPDATE chantiers SET etape = $1, historique = $2 WHERE id = $3`,
    [nextEtape, JSON.stringify(historique), req.params.id]
  );
  res.json({ message: `Passage à l'étape "${nextEtape}" effectué` });
});

export default router;