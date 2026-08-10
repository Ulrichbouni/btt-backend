import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { validate, produitSchema } from '../middleware/validation.js';
const router = express.Router();

// Liste des produits (avec filtres)
router.get('/', verifyToken, async (req, res) => {
  const { categorie, statut, langue } = req.query;
  let query = 'SELECT * FROM produits WHERE 1=1';
  const params = [];
  if (categorie) { params.push(categorie); query += ` AND categorie = $${params.length}`; }
  if (statut) { params.push(statut); query += ` AND statut_stock = $${params.length}`; }
  query += ' ORDER BY id';
  const result = await pool.query(query, params);
  // Si langue = 'en', renvoyer nom_en, application_en
  if (langue === 'en') {
    const data = result.rows.map(p => ({
      ...p,
      nom: p.nom_en || p.nom,
      application: p.application_en || p.application
    }));
    return res.json(data);
  }
  res.json(result.rows);
});

// Détail d'un produit
router.get('/:id', verifyToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM produits WHERE id = $1', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json(result.rows[0]);
});

// Admin : Créer un produit
router.post('/', verifyToken, validate(produitSchema), async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { nom, nom_en, epaisseur, categorie, application, application_en, prix_ttc, poids_unite, qte_conteneur, statut_stock } = req.body;
  const result = await pool.query(
    `INSERT INTO produits (nom, nom_en, epaisseur, categorie, application, application_en, prix_ttc, poids_unite, qte_conteneur, statut_stock) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [nom, nom_en, epaisseur, categorie, application, application_en, prix_ttc, poids_unite, qte_conteneur, statut_stock]
  );
  res.status(201).json(result.rows[0]);
});

// Admin : Mettre à jour un produit
router.put('/:id', verifyToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { id } = req.params;
  const { nom, nom_en, epaisseur, categorie, application, application_en, prix_ttc, poids_unite, qte_conteneur, statut_stock } = req.body;
  const result = await pool.query(
    `UPDATE produits SET nom=$1, nom_en=$2, epaisseur=$3, categorie=$4, application=$5, application_en=$6, prix_ttc=$7, poids_unite=$8, qte_conteneur=$9, statut_stock=$10 WHERE id=$11 RETURNING *`,
    [nom, nom_en, epaisseur, categorie, application, application_en, prix_ttc, poids_unite, qte_conteneur, statut_stock, id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json(result.rows[0]);
});

export default router;