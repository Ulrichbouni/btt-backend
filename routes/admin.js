import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
const router = express.Router();

// --- Devis ---
router.get('/devis/:id', verifyToken, isAdmin, async (req, res) => {
  const result = await pool.query('SELECT * FROM devis WHERE id = $1', [req.params.id]);
  res.json(result.rows[0]);
});

router.put('/devis/:id', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { remise_pourcentage, frais_transport, frais_divers } = req.body;
  const devis = await pool.query('SELECT cout_estime_brut FROM devis WHERE id = $1', [id]);
  if (!devis.rows.length) return res.status(404).json({ error: 'Devis non trouvé' });
  const brut = parseFloat(devis.rows[0].cout_estime_brut);
  const remise = parseFloat(remise_pourcentage) || 0;
  const transport = parseFloat(frais_transport) || 0;
  const divers = parseFloat(frais_divers) || 0;
  const total_final = brut * (1 - remise / 100) + transport + divers;
  await pool.query(
    `UPDATE devis SET remise_pourcentage=$1, frais_transport=$2, frais_divers=$3, total_final=$4 WHERE id=$5`,
    [remise, transport, divers, total_final, id]
  );
  res.json({ message: 'Devis mis à jour', total_final });
});

router.post('/devis/:id/valider', verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const devis = await pool.query('SELECT total_final FROM devis WHERE id = $1', [id]);
  if (!devis.rows.length || devis.rows[0].total_final === null)
    return res.status(400).json({ error: 'Ajustez d\'abord le devis' });
  await pool.query('UPDATE devis SET statut = $1 WHERE id = $2', ['accepte', id]);
  await pool.query(
    `INSERT INTO chantiers (devis_id, historique) VALUES ($1, $2)`,
    [id, JSON.stringify([{ date: new Date().toISOString(), action: 'Chantier créé' }])]
  );
  res.json({ message: 'Devis validé, chantier créé' });
});

// --- Missions technicien ---
router.post('/missions', verifyToken, isAdmin, async (req, res) => {
  const { devis_id, technicien_id, date_visite } = req.body;
  const result = await pool.query(
    `INSERT INTO missions_technicien (devis_id, technicien_id, date_visite) VALUES ($1,$2,$3) RETURNING *`,
    [devis_id, technicien_id, date_visite]
  );
  res.status(201).json(result.rows[0]);
});

router.get('/missions/technicien/:technicien_id', verifyToken, async (req, res) => {
  // accessible par le technicien lui-même (vérifier que l'utilisateur est bien ce technicien)
  const { technicien_id } = req.params;
  if (req.user.id !== technicien_id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Accès refusé' });
  const result = await pool.query(
    `SELECT m.*, d.ville, d.adresse FROM missions_technicien m 
     JOIN devis d ON m.devis_id = d.id 
     WHERE m.technicien_id = $1`,
    [technicien_id]
  );
  res.json(result.rows);
});

router.post('/missions/:mission_id/mesures', verifyToken, async (req, res) => {
  const { mission_id } = req.params;
  const { longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, photo_urls, croquis_url } = req.body;
  // Vérifier que le technicien est bien assigné à cette mission
  const mission = await pool.query('SELECT technicien_id FROM missions_technicien WHERE id = $1', [mission_id]);
  if (!mission.rows.length) return res.status(404).json({ error: 'Mission inconnue' });
  if (mission.rows[0].technicien_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Accès refusé' });

  const surface_reelle = (longueur_murs * hauteur_sous_plafond) - (surface_ouverte || 0);
  // À adapter selon la surface du panneau (ex: 1.2m²)
  const nb_panneaux_reel = Math.ceil(surface_reelle / 1.2);

  const result = await pool.query(
    `INSERT INTO mesures_terrain 
     (mission_id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, 
      surface_reelle, nb_panneaux_reel, photo_urls, croquis_url) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [mission_id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre,
     surface_reelle, nb_panneaux_reel, photo_urls || [], croquis_url]
  );
  // Mettre à jour le statut de la mission
  await pool.query('UPDATE missions_technicien SET statut = $1 WHERE id = $2', ['en_cours', mission_id]);
  res.status(201).json(result.rows[0]);
});

router.put('/missions/:mission_id/valider', verifyToken, isAdmin, async (req, res) => {
  const { mission_id } = req.params;
  // Récupérer les mesures pour les valider
  const mesures = await pool.query('SELECT * FROM mesures_terrain WHERE mission_id = $1', [mission_id]);
  if (!mesures.rows.length) return res.status(400).json({ error: 'Aucune mesure saisie' });
  await pool.query('UPDATE mesures_terrain SET valide_par_admin = true WHERE mission_id = $1', [mission_id]);
  await pool.query('UPDATE missions_technicien SET statut = $1 WHERE id = $2', ['terminee', mission_id]);
  res.json({ message: 'Mesures validées, mission terminée' });
});

export default router;