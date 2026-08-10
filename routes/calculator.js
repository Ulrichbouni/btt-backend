import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { validate, calculateurSchema } from '../middleware/validation.js';
const router = express.Router();

// Calcul des besoins (précision métier)
router.post('/estimer', verifyToken, validate(calculateurSchema), async (req, res) => {
  const { longueur, largeur, type_batiment, etage, epaisseur, produit_id } = req.body;
  
  // 1. Récupérer le produit
  const produit = await pool.query('SELECT * FROM produits WHERE id = $1', [produit_id]);
  if (!produit.rows.length) return res.status(404).json({ error: 'Produit non trouvé' });
  const p = produit.rows[0];
  
  // 2. Surface (m²)
  const surface = parseFloat(longueur) * parseFloat(largeur);
  if (isNaN(surface) || surface <= 0) return res.status(400).json({ error: 'Dimensions invalides' });
  
  // 3. Suggestion d'épaisseur selon type (si non fournie)
  const suggestions = {
    'residentiel': '10mm',
    'commercial': '12mm',
    'industriel': '14mm'
  };
  const epaisseur_suggested = suggestions[type_batiment] || '10mm';
  const epa_finale = epaisseur || epaisseur_suggested;
  
  // 4. Nombre de panneaux (avec marge de 10%)
  const surface_panneau = 1.2; // m² standard
  const nb_panneaux = Math.ceil((surface / surface_panneau) * 1.10);
  
  // 5. Ossature (mètres linéaires) : environ 2.5 ml par panneau
  const ossature_ml = nb_panneaux * 2.5;
  
  // 6. Vis : 8 vis par panneau
  const nb_vis = nb_panneaux * 8;
  
  // 7. Poids total
  const poids_total = nb_panneaux * p.poids_unite;
  
  // 8. Équivalent conteneur 20 pieds
  const equivalent_conteneur = nb_panneaux / p.qte_conteneur;
  
  // 9. Coût total (prix unitaire * nb) avec pondération étage (2% par étage)
  const etage_ponderation = (etage || 0) * 0.02; // 2% par étage
  const cout_total = nb_panneaux * p.prix_ttc * (1 + etage_ponderation);
  
  // 10. Sauvegarder dans l'historique
  await pool.query(
    `INSERT INTO calculs_historique (utilisateur_id, surface, type_batiment, etage, epaisseur_panneau, nb_panneaux, cout_total) 
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [req.user.id, surface, type_batiment, etage || 0, epa_finale, nb_panneaux, cout_total]
  );
  
  res.json({
    surface,
    type_batiment,
    etage: etage || 0,
    epaisseur_suggested,
    epaisseur_selected: epa_finale,
    nb_panneaux,
    ossature_ml: Math.round(ossature_ml * 10) / 10,
    nb_vis,
    poids_total: Math.round(poids_total * 10) / 10,
    equivalent_conteneur: Math.round(equivalent_conteneur * 100) / 100,
    cout_total: Math.round(cout_total),
    produit: p.nom,
    mention: 'Estimation indicative à confirmer par un technicien'
  });
});

// Obtenir l'historique des calculs (pour l'admin)
router.get('/historique', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const result = await pool.query(
    `SELECT c.*, u.nom as utilisateur_nom 
     FROM calculs_historique c 
     JOIN utilisateurs u ON c.utilisateur_id = u.id 
     ORDER BY c.created_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

export default router;