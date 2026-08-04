import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
const router = express.Router();

// Liste des professionnels (filtres: métier, ville)
router.get('/', verifyToken, async (req, res) => {
  const { metier, ville } = req.query;
  let query = 'SELECT * FROM professionnels WHERE 1=1';
  const params = [];
  if (metier) { params.push(metier); query += ` AND role = $${params.length}`; }
  if (ville) { params.push(ville); query += ` AND ville = $${params.length}`; }
  query += ' ORDER BY note DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

// Détail d'un professionnel
router.get('/:id', verifyToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM professionnels WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Professionnel non trouvé' });
  res.json(result.rows[0]);
});

// Admin: Créer un professionnel
router.post('/', verifyToken, isAdmin, async (req, res) => {
  const { nom, role, ville, telephone, niveau_certification, note, nb_chantiers } = req.body;
  const result = await pool.query(
    `INSERT INTO professionnels (nom, role, ville, telephone, niveau_certification, note, nb_chantiers) 
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nom, role, ville, telephone, niveau_certification, note || 0, nb_chantiers || 0]
  );
  res.status(201).json(result.rows[0]);
});

// Admin: Importer CSV
router.post('/import', verifyToken, isAdmin, async (req, res) => {
  const { contacts } = req.body; // [{nom, ville, telephone, metier}]
  const inserted = [];
  for (const c of contacts) {
    const result = await pool.query(
      `INSERT INTO professionnels (nom, ville, telephone, role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
      [c.nom, c.ville, c.telephone, c.metier]
    );
    if (result.rows.length) inserted.push(result.rows[0]);
  }
  res.json({ inserted: inserted.length, total: contacts.length });
});

// Admin: Mettre à jour un professionnel
router.put('/:id', verifyToken, isAdmin, async (req, res) => {
  const { nom, role, ville, telephone, niveau_certification, note, nb_chantiers } = req.body;
  const result = await pool.query(
    `UPDATE professionnels SET nom=$1, role=$2, ville=$3, telephone=$4, niveau_certification=$5, note=$6, nb_chantiers=$7 WHERE id=$8 RETURNING *`,
    [nom, role, ville, telephone, niveau_certification, note, nb_chantiers, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Professionnel non trouvé' });
  res.json(result.rows[0]);
});

// Admin: Supprimer un professionnel
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
  await pool.query('DELETE FROM professionnels WHERE id = $1', [req.params.id]);
  res.json({ message: 'Professionnel supprimé' });
});

export default router;