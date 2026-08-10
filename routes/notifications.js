import express from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/auth.js";
const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM notifications WHERE utilisateur_id = $1 ORDER BY date_envoi DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

router.patch("/:id/lu", verifyToken, async (req, res) => {
  await pool.query(
    `UPDATE notifications SET lu = true WHERE id = $1 AND utilisateur_id = $2`,
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

export default router;
