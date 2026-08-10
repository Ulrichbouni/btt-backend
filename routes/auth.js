import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as speakeasy from 'speakeasy';
import pool from "../db.js";
import { validate, registerSchema, loginSchema } from "../middleware/validation.js";
import WhatsAppService from "../services/whatsapp.js";

const router = express.Router();

router.post("/request-otp", async (req, res) => {
  const { telephone } = req.body;
  if (!telephone) return res.status(400).json({ error: "Telephone requis" });
  const sent = await WhatsAppService.sendVerificationCode(telephone);
  res.json({ success: !!sent.success, mock: !!sent.mock });
});

router.post("/verify-otp", async (req, res) => {
  const { telephone, code } = req.body;
  if (!telephone || !code) return res.status(400).json({ error: "Telephone et code requis" });
  const check = await WhatsAppService.checkVerificationCode(telephone, code);
  if (!check.success) return res.status(400).json({ error: "OTP invalide ou expire" });
  res.json({ success: true });
});

router.post("/register", validate(registerSchema), async (req, res) => {
  const { nom, email, telephone, mot_de_passe, role } = req.body;
  try {
    const existing = await pool.query("SELECT id FROM utilisateurs WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Cet email est deja utilise" });

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const result = await pool.query(
      "INSERT INTO utilisateurs (nom, email, telephone, mot_de_passe_hash, role, telephone_verified) VALUES ($1,$2,$3,$4,$5,true) RETURNING id, nom, email, role",
      [nom, email, telephone, hash, role || "client"]
    );
    res.status(201).json({
      id: result.rows[0].id,
      nom: result.rows[0].nom,
      email: result.rows[0].email,
      role: result.rows[0].role,
      message: "Utilisateur cree avec succes"
    });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(400).json({ error: "Erreur lors de la creation du compte" });
  }
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, mot_de_passe, otp_token } = req.body;
  try {
    const user = await pool.query(
      "SELECT id, nom, email, mot_de_passe_hash, role FROM utilisateurs WHERE email = $1",
      [email]
    );
    if (user.rows.length === 0) return res.status(401).json({ error: "Identifiants invalides" });

    const match = await bcrypt.compare(mot_de_passe, user.rows[0].mot_de_passe_hash);
    if (!match) return res.status(401).json({ error: "Identifiants invalides" });

    const otpRecord = await pool.query(
      "SELECT secret, enabled FROM otp_secrets WHERE utilisateur_id = $1",
      [user.rows[0].id]
    );
    if (otpRecord.rows.length && otpRecord.rows[0].enabled) {
      if (!otp_token) return res.status(401).json({ error: "OTP_REQUIRED", message: "Code OTP requis" });
      const verified = speakeasy.totp.verify({
        secret: otpRecord.rows[0].secret,
        encoding: "base32",
        token: otp_token,
        window: 2
      });
      if (!verified) return res.status(401).json({ error: "Code OTP invalide" });
    }

    const token = jwt.sign(
      { id: user.rows[0].id, role: user.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );
    res.json({
      token,
      user: {
        id: user.rows[0].id,
        nom: user.rows[0].nom,
        email: user.rows[0].email,
        role: user.rows[0].role,
        otp_enabled: otpRecord.rows.length > 0 && otpRecord.rows[0].enabled,
      },
    });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: "Erreur serveur lors de la connexion" });
  }
});

router.get("/me", verifyToken, async (req, res) => {
  const u = await pool.query("SELECT id, nom, email, role, telephone FROM utilisateurs WHERE id = $1", [req.user.id]);
  res.json(u.rows[0]);
});

export default router;

