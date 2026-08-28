import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import * as speakeasy from 'speakeasy';
import pool from "../db.js";
import { validate, registerSchema, loginSchema } from "../middleware/validation.js";
import { verifyToken } from "../middleware/auth.js";
import WhatsAppService from "../services/whatsapp.js";
import EmailService from "../services/email.js";
import logger from "../services/logger.js";

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
// Notifications: email de bienvenue + WhatsApp
    await EmailService.sendWelcome(result.rows[0].nom, email);
    if (telephone) {
      WhatsAppService.sendMessage(telephone, "Bienvenue sur BTT-LUX, " + result.rows[0].nom + " ! Votre compte est cree avec succes.");
    }
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

// --- Mot de passe oublié (envoie un token de réinitialisation par email) ---
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email requis" });

  try {
    const user = await pool.query("SELECT id, nom, email FROM utilisateurs WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return res.json({ success: true, message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
    }

    // Token de réinitialisation (15 min)
    const token = jwt.sign(
      { id: user.rows[0].id, purpose: "reset-password" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    await EmailService.sendResetPassword(user.rows[0].nom, user.rows[0].email, token);
    logger.info('forgot-password envoyé', { email: user.rows[0].email });
    res.json({ success: true, message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
  } catch (err) {
    logger.error('forgot-password erreur', { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Réinitialiser le mot de passe avec le token reçu par email ---
router.post("/reset-password", async (req, res) => {
  const { token, mot_de_passe } = req.body;
  if (!token || !mot_de_passe) return res.status(400).json({ error: "Token et mot de passe requis" });
  if (mot_de_passe.length < 6) return res.status(400).json({ error: "Mot de passe trop court (min 6 caractères)" });

  try {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "Token invalide ou expiré" });
    }
    if (decoded.purpose !== "reset-password") {
      return res.status(400).json({ error: "Token invalide" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    await pool.query("UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE id = $2", [hash, decoded.id]);
    logger.info('mot de passe réinitialisé', { userId: decoded.id });
    res.json({ success: true, message: "Mot de passe mis à jour. Vous pouvez vous connecter." });
  } catch (err) {
    logger.error('reset-password erreur', { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;

