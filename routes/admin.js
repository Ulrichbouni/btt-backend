import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
const router = express.Router();

// GET - Détail du devis
router.get('/devis/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devis WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Devis non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Mise à jour de la remise, transport, divers + RECALCUL AUTO
router.put('/devis/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { remise_pourcentage, frais_transport, frais_divers } = req.body;

  try {
    const devis = await pool.query('SELECT cout_estime_brut FROM devis WHERE id = $1', [id]);
    if (devis.rows.length === 0) return res.status(404).json({ error: 'Devis non trouvé' });
    
    const brut = parseFloat(devis.rows[0].cout_estime_brut);
    const remise = parseFloat(remise_pourcentage) || 0;
    const transport = parseFloat(frais_transport) || 0;
    const divers = parseFloat(frais_divers) || 0;

    const total_final = brut * (1 - (remise / 100)) + transport + divers;

    await pool.query(
      `UPDATE devis 
       SET remise_pourcentage = $1, frais_transport = $2, frais_divers = $3, total_final = $4 
       WHERE id = $5`,
      [remise, transport, divers, total_final, id]
    );

    res.json({ message: 'Devis mis à jour', total_final });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST - Valider le devis (-> Chantier)
router.post('/devis/:id/valider', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const devis = await pool.query('SELECT total_final FROM devis WHERE id = $1', [id]);
    if (devis.rows.length === 0 || devis.rows[0].total_final === null) {
      return res.status(400).json({ error: 'Le devis doit d\'abord être ajusté (PUT)' });
    }

    await pool.query('UPDATE devis SET statut = $1 WHERE id = $2', ['accepte', id]);
    await pool.query(
      `INSERT INTO chantiers (devis_id, historique) VALUES ($1, $2)`,
      [id, JSON.stringify([{ date: new Date().toISOString(), action: 'Chantier créé depuis le devis' }])]
    );
    res.json({ message: 'Devis validé, chantier créé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;