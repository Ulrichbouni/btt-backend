import express from "express";
import pool from "../db.js";
import { verifyToken, isAdmin } from "../middleware/auth.js";
const router = express.Router();

// Mes chantiers (client)
router.get("/mes-chantiers", verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, d.ville, d.adresse, d.surface 
     FROM chantiers c 
     JOIN devis d ON c.devis_id = d.id 
     WHERE d.utilisateur_id = $1 
     ORDER BY c.created_at DESC`,
    [req.user.id],
  );
  res.json(result.rows);
});

// Détail d'un chantier
router.get("/:id", verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, d.ville, d.adresse, d.surface, d.utilisateur_id, m.technicien_id 
     FROM chantiers c 
     JOIN devis d ON c.devis_id = d.id 
     LEFT JOIN missions_technicien m ON m.devis_id = d.id
     WHERE c.id = $1`,
    [req.params.id],
  );
  if (!result.rows.length)
    return res.status(404).json({ error: "Chantier non trouvé" });
  const row = result.rows[0];
  const isOwner = row.utilisateur_id === req.user.id;
  const isAdmin = req.user.role === "admin";
  const isAssignedTech =
    req.user.role === "technicien" && row.technicien_id === req.user.id;
  if (!isOwner && !isAdmin && !isAssignedTech) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  res.json(row);
});

// Avancer l'etape (admin ou TECHNICIEN ASSIGNE uniquement)
// FIX : avant, n'importe quel technicien pouvait avancer n'importe quel chantier.
router.put("/:id/avancer", verifyToken, async (req, res) => {
  if (req.user.role !== "admin" && req.user.role !== "technicien") {
    return res.status(403).json({ error: "Admin ou technicien requis" });
  }
  const row = await pool.query(
    `SELECT c.etape, c.historique, m.technicien_id
     FROM chantiers c
     JOIN devis d ON c.devis_id = d.id
     LEFT JOIN missions_technicien m ON m.devis_id = d.id
     WHERE c.id = $1`,
    [req.params.id],
  );
  if (!row.rows.length)
    return res.status(404).json({ error: "Chantier non trouvé" });
  if (
    req.user.role === "technicien" &&
    row.rows[0].technicien_id !== req.user.id
  ) {
    return res
      .status(403)
      .json({ error: "Seul le technicien assigne peut avancer ce chantier" });
  }
  const etapes = [
    "Devis reçu",
    "Visite technique",
    "Commande validée",
    "Livraison",
    "Pose en cours",
    "Chantier terminé",
  ];
  const chantier = row.rows[0];
  const currentIndex = etapes.indexOf(chantier.etape);
  if (currentIndex >= etapes.length - 1)
    return res.status(400).json({ error: "Déjà à la dernière étape" });
  const nextEtape = etapes[currentIndex + 1];
  const historique = chantier.historique || [];
  historique.push({
    date: new Date().toISOString(),
    action: `Passage à l'étape: ${nextEtape}`,
    par: req.user.id,
  });
  await pool.query(
    `UPDATE chantiers SET etape = $1, historique = $2 WHERE id = $3`,
    [nextEtape, JSON.stringify(historique), req.params.id],
  );
  res.json({ message: `Passage à l'étape "${nextEtape}" effectué` });
});
// Admin : lister tous les chantiers
router.get("/admin/tous", verifyToken, isAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT c.*, d.ville, d.adresse, d.surface,
            u.nom AS client_nom, u.email AS client_email,
            tech.nom AS technicien_nom
     FROM chantiers c
     JOIN devis d ON c.devis_id = d.id
     JOIN utilisateurs u ON u.id = d.utilisateur_id
     LEFT JOIN missions_technicien m ON m.devis_id = d.id
     LEFT JOIN utilisateurs tech ON tech.id = m.technicien_id
     ORDER BY c.created_at DESC`,
  );
  res.json(result.rows);
});

// Admin ou technicien assigné : ajouter des photos avant/après
router.post("/:id/photos", verifyToken, async (req, res) => {
  const { type, urls } = req.body;
  if (!["avant", "apres"].includes(type)) {
    return res.status(400).json({ error: 'type doit être "avant" ou "apres"' });
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    return res
      .status(400)
      .json({ error: "urls doit être un tableau non vide" });
  }
  if (!urls.every((u) => typeof u === "string" && u.length > 0)) {
    return res.status(400).json({ error: "Chaque url doit être une chaîne" });
  }

  const row = await pool.query(
    `SELECT c.id, m.technicien_id
     FROM chantiers c
     JOIN devis d ON c.devis_id = d.id
     LEFT JOIN missions_technicien m ON m.devis_id = d.id
     WHERE c.id = $1`,
    [req.params.id],
  );
  if (!row.rows.length)
    return res.status(404).json({ error: "Chantier non trouvé" });

  const isAdminUser = req.user.role === "admin";
  const isAssignedTech =
    req.user.role === "technicien" && row.rows[0].technicien_id === req.user.id;

  if (!isAdminUser && !isAssignedTech) {
    return res
      .status(403)
      .json({ error: "Admin ou technicien assigné requis" });
  }

  const sql =
    type === "avant"
      ? `UPDATE chantiers SET photos_avant = COALESCE(photos_avant, '[]'::jsonb) || $1::jsonb WHERE id = $2 RETURNING photos_avant AS photos`
      : `UPDATE chantiers SET photos_apres = COALESCE(photos_apres, '[]'::jsonb) || $1::jsonb WHERE id = $2 RETURNING photos_apres AS photos`;

  const result = await pool.query(sql, [JSON.stringify(urls), req.params.id]);

  const chantier = await pool.query(
    "SELECT historique FROM chantiers WHERE id = $1",
    [req.params.id],
  );
  const hist = chantier.rows[0].historique || [];
  hist.push({
    date: new Date().toISOString(),
    action: `Ajout de ${urls.length} photo(s) ${type}`,
    par: req.user.id,
  });
  await pool.query("UPDATE chantiers SET historique = $1 WHERE id = $2", [
    JSON.stringify(hist),
    req.params.id,
  ]);

  res.json({
    message: `Photos ${type} ajoutées`,
    photos: result.rows[0].photos,
  });
});

export default router;
