import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
import { validate, missionSchema, mesuresSchema } from '../middleware/validation.js';
import WhatsAppService from '../services/whatsapp.js';
const router = express.Router();

// --- TECHNICIEN : Voir ses missions ---
router.get('/technicien/mes-missions', verifyToken, async (req, res) => {
  if (req.user.role !== 'technicien' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Rôle technicien requis' });
  }
  const id = req.user.role === 'admin' ? req.query.technicien_id : req.user.id;
  if (!id) return res.status(400).json({ error: 'ID technicien manquant' });
  
  const result = await pool.query(
    `SELECT m.*, d.ville, d.adresse, d.surface, u.nom as client_nom 
     FROM missions_technicien m 
     JOIN devis d ON m.devis_id = d.id 
     JOIN utilisateurs u ON d.utilisateur_id = u.id 
     WHERE m.technicien_id = $1 
     ORDER BY m.created_at DESC`,
    [id]
  );
  res.json(result.rows);
});

// --- TECHNICIEN : Détail d'une mission avec ses mesures ---
router.get('/:mission_id', verifyToken, async (req, res) => {
  const { mission_id } = req.params;
  const mission = await pool.query(
    `SELECT m.*, d.ville, d.adresse, d.surface 
     FROM missions_technicien m 
     JOIN devis d ON m.devis_id = d.id 
     WHERE m.id = $1`,
    [mission_id]
  );
  if (!mission.rows.length) return res.status(404).json({ error: 'Mission inconnue' });
  if (mission.rows[0].technicien_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  const mesures = await pool.query('SELECT * FROM mesures_terrain WHERE mission_id = $1', [mission_id]);
  res.json({ mission: mission.rows[0], mesures: mesures.rows });
});

// --- TECHNICIEN : Soumettre les mesures ---
router.post('/:mission_id/mesures', verifyToken, validate(mesuresSchema), async (req, res) => {
  const { mission_id } = req.params;
  const { longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, photo_urls, croquis_url } = req.body;
  
  // Vérifier la mission
  const mission = await pool.query('SELECT technicien_id FROM missions_technicien WHERE id = $1', [mission_id]);
  if (!mission.rows.length) return res.status(404).json({ error: 'Mission inconnue' });
  if (mission.rows[0].technicien_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  
  // Calculs automatiques
  const surface_reelle = (parseFloat(longueur_murs) * parseFloat(hauteur_sous_plafond)) - (parseFloat(surface_ouverte) || 0);
  const nb_panneaux_reel = Math.ceil(surface_reelle / 1.2);
  
  const result = await pool.query(
    `INSERT INTO mesures_terrain 
     (mission_id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, 
      surface_reelle, nb_panneaux_reel, photo_urls, croquis_url) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [mission_id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre,
     surface_reelle, nb_panneaux_reel, photo_urls || [], croquis_url]
  );
  
  await pool.query('UPDATE missions_technicien SET statut = $1 WHERE id = $2', ['en_cours', mission_id]);
  res.status(201).json(result.rows[0]);
});

// --- ADMIN : Valider les mesures ---
router.put('/:mission_id/valider', verifyToken, isAdmin, async (req, res) => {
  const { mission_id } = req.params;
  const mesures = await pool.query('SELECT * FROM mesures_terrain WHERE mission_id = $1', [mission_id]);
  if (!mesures.rows.length) return res.status(400).json({ error: 'Aucune mesure saisie' });
  await pool.query('UPDATE mesures_terrain SET valide_par_admin = true WHERE mission_id = $1', [mission_id]);
  await pool.query('UPDATE missions_technicien SET statut = $1 WHERE id = $2', ['terminee', mission_id]);
  
  // Mettre à jour le chantier avec les mesures validées
  const devis = await pool.query('SELECT devis_id FROM missions_technicien WHERE id = $1', [mission_id]);
  if (devis.rows.length) {
    await pool.query('UPDATE chantiers SET mission_id = $1 WHERE devis_id = $2', [mission_id, devis.rows[0].devis_id]);
  }
  res.json({ message: 'Mesures validées, mission terminée' });
});

// --- ADMIN : Créer une mission ---
router.post('/', verifyToken, isAdmin, validate(missionSchema), async (req, res) => {
  const { devis_id, technicien_id, date_visite } = req.body;
  const result = await pool.query(
    `INSERT INTO missions_technicien (devis_id, technicien_id, date_visite) VALUES ($1,$2,$3) RETURNING *`,
    [devis_id, technicien_id, date_visite]
  );

  // Notification au technicien par WhatsApp
  const tech = await pool.query('SELECT telephone, nom FROM utilisateurs WHERE id=$1', [technicien_id]);
  if (tech.rows[0]?.telephone) {
    WhatsAppService.sendMissionNotification(
      tech.rows[0].telephone,
      result.rows[0].id,
      date_visite,
      devis_id
    );
  }

  res.status(201).json(result.rows[0]);
});

export default router;