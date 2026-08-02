import express from 'express';
import pool from '../db.js';
import { verifyToken, isAdmin } from '../middleware/auth.js';
const router = express.Router();

// GET - Liste des missions pour un technicien (son id est dans req.user)
router.get('/technicien/mes-missions', verifyToken, async (req, res) => {
    try {
        // Vérifier que l'utilisateur est bien un technicien
        if (req.user.role !== 'technicien') {
            return res.status(403).json({ error: 'Accès réservé aux techniciens' });
        }
        const result = await pool.query(
            `SELECT m.*, d.ville, d.adresse, d.surface, u.nom as client_nom 
             FROM missions_technicien m
             JOIN devis d ON m.devis_id = d.id
             JOIN utilisateurs u ON d.utilisateur_id = u.id
             WHERE m.technicien_id = $1
             ORDER BY m.created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST - Créer une mission par l'admin (assigner un technicien à un devis)
router.post('/admin/missions', verifyToken, isAdmin, async (req, res) => {
    const { devis_id, technicien_id, date_visite } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO missions_technicien (devis_id, technicien_id, date_visite, statut) 
             VALUES ($1, $2, $3, 'assignee')
             RETURNING *`,
            [devis_id, technicien_id, date_visite]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT - Envoyer les mesures terrain (par le technicien)
router.put('/technicien/missions/:id/mesures', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, photo_urls, croquis_url } = req.body;

    try {
        // Vérifier que la mission appartient bien au technicien connecté
        const mission = await pool.query(
            'SELECT * FROM missions_technicien WHERE id = $1 AND technicien_id = $2',
            [id, req.user.id]
        );
        if (mission.rows.length === 0) {
            return res.status(403).json({ error: 'Mission non trouvée ou non assignée à ce technicien' });
        }

        // Calcul automatique
        const surface_reelle = (longueur_murs * hauteur_sous_plafond) - surface_ouverte;
        const nb_panneaux_reel = Math.ceil(surface_reelle / 2.88) + Math.ceil(surface_reelle / 2.88 * 0.1); // Marge de 10%

        const result = await pool.query(
            `INSERT INTO mesures_terrain 
             (mission_id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, surface_reelle, nb_panneaux_reel, photo_urls, croquis_url)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [id, longueur_murs, hauteur_sous_plafond, surface_ouverte, perimetre, surface_reelle, nb_panneaux_reel, photo_urls || [], croquis_url]
        );

        // Mettre à jour le statut de la mission
        await pool.query('UPDATE missions_technicien SET statut = $1 WHERE id = $2', ['terminee', id]);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT - Valider les mesures par l'admin
router.put('/admin/mesures/:id/valider', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE mesures_terrain SET valide_par_admin = TRUE WHERE id = $1 RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Mesure non trouvée' });
        }
        // Optionnel : Mettre à jour le devis avec les nouvelles quantités réelles
        res.json(result.rows[0]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET - Récupérer les mesures d'une mission (admin)
router.get('/admin/missions/:id/mesures', verifyToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM mesures_terrain WHERE mission_id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Aucune mesure pour cette mission' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;