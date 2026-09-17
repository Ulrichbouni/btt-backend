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

// NOTE : la gestion des missions (lister/créer/modifier/supprimer) se fait
// via /api/missions/* (voir routes/missions.js), qui couvre exactement les
// mêmes besoins admin en plus complet (notification WhatsApp à la création,
// flux de validation des mesures terrain). Pas de duplication ici.
// Admin : modifier les infos d'un utilisateur (nom, email, telephone)
router.put("/utilisateurs/:id", verifyToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { nom, email, telephone } = req.body;

  if (!nom && !email && !telephone) {
    return res.status(400).json({ error: "Aucun champ à modifier" });
  }
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Email invalide" });
    }
  }

  try {
    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone)
       WHERE id = $4
       RETURNING id, nom, email, telephone, role`,
      [nom || null, email || null, telephone || null, id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }
    res.json({ message: "Utilisateur mis à jour", user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email ou téléphone déjà utilisé" });
    }
    throw err;
  }
});
export default router;
