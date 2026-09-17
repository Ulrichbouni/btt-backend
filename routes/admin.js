import express from "express";
import pool from "../db.js";
import { verifyToken, isAdmin } from "../middleware/auth.js";
const router = express.Router();

// --- Gestion des utilisateurs (Admin) ---
router.get("/utilisateurs", verifyToken, isAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT id, nom, email, telephone, role, telephone_verified, created_at 
     FROM utilisateurs ORDER BY created_at DESC`,
  );
  res.json(result.rows);
});

router.put("/utilisateurs/:id/role", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!role || !["client", "technicien", "admin"].includes(role)) {
    return res
      .status(400)
      .json({ error: "Role invalide (client, technicien, admin)" });
  }

  const result = await pool.query(
    "UPDATE utilisateurs SET role = $1 WHERE id = $2 RETURNING id, nom, email, role",
    [role, id],
  );

  if (!result.rows.length)
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  res.json({ message: `Rôle mis à jour: ${role}`, user: result.rows[0] });
});

router.delete("/utilisateurs/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  if (id === req.user.id) {
    return res
      .status(400)
      .json({ error: "Vous ne pouvez pas supprimer votre propre compte" });
  }
  const result = await pool.query(
    "DELETE FROM utilisateurs WHERE id = $1 RETURNING id",
    [id],
  );
  if (!result.rows.length)
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  res.json({ message: "Utilisateur supprimé" });
});

router.get("/missions", verifyToken, isAdmin, async (req, res) => {
  const result = await pool.query(
    `SELECT m.*, d.ville, d.adresse, d.surface,
            u.nom AS client_nom,
            tech.nom AS technicien_nom
     FROM missions_technicien m
     LEFT JOIN devis d ON d.id = m.devis_id
     LEFT JOIN utilisateurs u ON u.id = d.utilisateur_id
     LEFT JOIN utilisateurs tech ON tech.id = m.technicien_id
     ORDER BY m.created_at DESC`,
  );
  res.json(result.rows);
});

router.post("/missions", verifyToken, isAdmin, async (req, res) => {
  const { devis_id, technicien_id, date_visite } = req.body;
  const result = await pool.query(
    `INSERT INTO missions_technicien (devis_id, technicien_id, date_visite) VALUES ($1,$2,$3) RETURNING *`,
    [devis_id, technicien_id, date_visite],
  );
  res.status(201).json(result.rows[0]);
});

router.put("/missions/:mission_id", verifyToken, isAdmin, async (req, res) => {
  const { mission_id } = req.params;
  const { technicien_id, date_visite, statut } = req.body;

  const result = await pool.query(
    `UPDATE missions_technicien
     SET technicien_id = COALESCE($1, technicien_id),
         date_visite = COALESCE($2, date_visite),
         statut = COALESCE($3, statut)
     WHERE id = $4
     RETURNING *`,
    [technicien_id ?? null, date_visite ?? null, statut ?? null, mission_id],
  );

  if (!result.rows.length)
    return res.status(404).json({ error: "Mission introuvable" });
  res.json(result.rows[0]);
});

router.delete(
  "/missions/:mission_id",
  verifyToken,
  isAdmin,
  async (req, res) => {
    const result = await pool.query(
      "DELETE FROM missions_technicien WHERE id = $1 RETURNING id",
      [req.params.mission_id],
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Mission introuvable" });
    res.json({ message: "Mission supprimée", id: result.rows[0].id });
  },
);

export default router;
