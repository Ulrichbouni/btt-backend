import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { validate, devisSchema } from '../middleware/validation.js';
import WhatsAppService from '../services/whatsapp.js';
import EmailService from '../services/email.js';
const router = express.Router();

// Créer une demande de devis
router.post('/', verifyToken, validate(devisSchema), async (req, res) => {
  const { surface, ville, adresse, date_souhaitee, photos, plans, nb_panneaux, prix_unitaire, cout_estime_brut, total_final } = req.body;
  const result = await pool.query(
    `INSERT INTO devis (utilisateur_id, surface, ville, adresse, date_souhaitee, nb_panneaux, prix_unitaire, cout_estime_brut, total_final, statut) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'envoye') RETURNING *`,
    [req.user.id, surface, ville, adresse, date_souhaitee, nb_panneaux || null, prix_unitaire || null, cout_estime_brut || null, total_final || null]
  );

  // Notifications
  const client = await pool.query('SELECT telephone, email, nom FROM utilisateurs WHERE id=$1', [req.user.id]);
  const phone = client.rows[0]?.telephone;
  const email = client.rows[0]?.email;
  const montant = total_final || cout_estime_brut || 0;

  // WhatsApp notification
  if (phone) {
    WhatsAppService.sendDevisNotification(phone, result.rows[0].id, montant);
  }

  // Email notification
  if (email) {
    await EmailService.sendDevisConfirmation(email, client.rows[0].nom, result.rows[0].id, montant);
  }

  res.status(201).json(result.rows[0]);
});

// Mes devis (client)
router.get('/mes-devis', verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM devis WHERE utilisateur_id = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

// Détail d'un devis (client ou admin)
router.get('/:id', verifyToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM devis WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Devis non trouvé' });
  if (result.rows[0].utilisateur_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json(result.rows[0]);
});

// Admin: Tous les devis
router.get('/admin/tous', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const result = await pool.query(
    `SELECT d.*, u.nom as client_nom, u.email as client_email 
     FROM devis d 
     JOIN utilisateurs u ON d.utilisateur_id = u.id 
     ORDER BY d.created_at DESC`
  );
  res.json(result.rows);
});

export default router;