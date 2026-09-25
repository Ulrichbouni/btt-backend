import express from "express";
import bcrypt from "bcrypt";
import * as speakeasy from 'speakeasy';
import pool from "../db.js";
import crypto from "node:crypto";
import { validate, registerSchema, loginSchema, newPasswordSchema } from "../middleware/validation.js";
import { verifyToken } from "../middleware/auth.js";
import { signAuthToken, verifyAuthToken } from "../config/auth.js";
import WhatsAppService from "../services/whatsapp.js";
import EmailService from "../services/email.js";
import { verifyEmailToken } from "./auth-email.js";
import logger from "../services/logger.js";

const router = express.Router();

router.post("/request-otp", async (req, res) => {
  try {
    const { telephone, channel } = req.body;
    if (!telephone) return res.status(400).json({ error: "Telephone requis" });
    const sent = await WhatsAppService.sendVerificationCode(telephone, channel || 'sms');
    if (!sent.success) return res.status(502).json({ error: "Envoi OTP impossible", details: sent.error });
    res.json({ success: true, mock: !!sent.mock });
  } catch (err) {
    logger.error('request-otp error', { message: err.message });
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { telephone, code } = req.body;
    if (!telephone || !code) return res.status(400).json({ error: "Telephone et code requis" });
    const check = await WhatsAppService.checkVerificationCode(telephone, code);
    if (!check.success) return res.status(400).json({ error: "OTP invalide ou expire" });
    // Preuve signée que le téléphone a été vérifié (valable 15 min)
    const phone_verification_token = signAuthToken(
      { telephone, purpose: "phone-verified" },
      "15m"
    );
    res.json({ success: true, phone_verification_token });
  } catch (err) {
    logger.error('verify-otp error', { message: err.message });
    res.status(500).json({ error: "Erreur interne du serveur" });
  }
});

router.post("/register", validate(registerSchema), async (req, res) => {
  const { nom, email, telephone, mot_de_passe, phone_verification_token, email_verification_token } = req.body;
  try {
    const existing = await pool.query("SELECT id FROM utilisateurs WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Cet email est deja utilise" });

    if (telephone) {
      const existingTel = await pool.query("SELECT id FROM utilisateurs WHERE telephone = $1", [telephone]);
      if (existingTel.rows.length > 0) {
        return res.status(409).json({ error: "Ce numero de telephone est deja utilise. Connectez-vous ou utilisez un autre numero." });
      }
    }

    // Le téléphone n'est marqué vérifié que si un token signé (OTP validé) est fourni
    let telephoneVerified = false;
    if (phone_verification_token) {
      try {
        const decoded = verifyAuthToken(phone_verification_token);
        if (decoded.purpose === "phone-verified" && (!telephone || decoded.telephone === telephone)) {
          telephoneVerified = true;
        }
      } catch {
        logger.warn('register: phone_verification_token invalide', { email });
      }
    }

    // Si un token de vérification email est fourni, on vérifie qu'il
    // correspond bien à l'email d'inscription (scope email_verification, 15 min).
    let emailVerified = false;
    if (email_verification_token) {
      const verifiedEmail = verifyEmailToken(email_verification_token);
      if (verifiedEmail && verifiedEmail === String(email).toLowerCase()) {
        emailVerified = true;
      } else {
        logger.warn('register: email_verification_token invalide', { email });
      }
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const result = await pool.query(
      "INSERT INTO utilisateurs (nom, email, telephone, mot_de_passe_hash, role, telephone_verified, email_verified) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, nom, email, role",
      [nom, email, telephone, hash, "client", telephoneVerified, emailVerified]
    );
// Notifications: email de bienvenue + WhatsApp
    EmailService.sendWelcomeEmail(email, result.rows[0].nom).catch((err) =>
      logger.warn('register: sendWelcomeEmail echoue', { message: err.message })
    );
    if (telephone) {
      WhatsAppService.sendMessage(telephone, "Bienvenue sur BTT-LUX, " + result.rows[0].nom + " ! Votre compte est cree avec succes.");
    }
    res.status(201).json({
      id: result.rows[0].id,
      nom: result.rows[0].nom,
      email: result.rows[0].email,
      role: result.rows[0].role,
      email_verified: emailVerified,
      message: "Utilisateur cree avec succes"
    });
  } catch (err) {
    logger.error('Erreur register', { message: err.message });
    res.status(400).json({ error: "Erreur lors de la creation du compte" });
  }
});

router.post("/login", validate(loginSchema), async (req, res) => {
  const { email, mot_de_passe, otp_token } = req.body;
  try {
    const user = await pool.query(
      "SELECT id, nom, email, mot_de_passe_hash, role, auth_version FROM utilisateurs WHERE email = $1",
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

    // La version de session est embarquée dans le JWT : tout changement de
    // mot de passe (auth_version incrémenté en base) révoque les anciens jetons.
    const token = signAuthToken(
      {
        id: user.rows[0].id,
        role: user.rows[0].role,
        auth_version: Number.isInteger(user.rows[0].auth_version) ? user.rows[0].auth_version : 0,
      },
      "12h"
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
  const u = await pool.query("SELECT id, nom, email, role, telephone, telephone_verified FROM utilisateurs WHERE id = $1", [req.user.id]);
  res.json(u.rows[0]);
});

// --- Modifier le profil de l'utilisateur connecté ---
router.put("/me", verifyToken, async (req, res) => {
  const { nom, email, telephone, mot_de_passe } = req.body;
  const userId = req.user.id;

  try {
    // Vérifier si le nouvel email est déjà utilisé par un autre utilisateur
    if (email) {
      const existing = await pool.query("SELECT id FROM utilisateurs WHERE email = $1 AND id != $2", [email, userId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: "Cet email est déjà utilisé" });
      }
    }

    // Numéro courant : un changement remet telephone_verified à false
    const current = await pool.query("SELECT telephone FROM utilisateurs WHERE id = $1", [userId]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Utilisateur introuvable" });
    }

    // Construire la requête de mise à jour dynamiquement
    const updates = [];
    const params = [];
    if (nom) { params.push(nom); updates.push(`nom = $${params.length}`); }
    if (email) { params.push(email); updates.push(`email = $${params.length}`); }
    if (telephone && telephone !== current.rows[0].telephone) {
      params.push(telephone);
      updates.push(`telephone = $${params.length}`);
      // Un nouveau numéro doit être re-vérifié par OTP.
      updates.push(`telephone_verified = false`);
    }

    let passwordChanged = false;
    if (mot_de_passe) {
      const parsedPassword = newPasswordSchema.safeParse(mot_de_passe);
      if (!parsedPassword.success) {
        return res.status(400).json({
          error: parsedPassword.error.issues?.[0]?.message || "Mot de passe invalide",
        });
      }
      const hash = await bcrypt.hash(mot_de_passe, 10);
      params.push(hash);
      updates.push(`mot_de_passe_hash = $${params.length}`);
      // Incrémente la version de session : tous les anciens JWT sont révoqués.
      updates.push(`auth_version = COALESCE(auth_version, 0) + 1`);
      passwordChanged = true;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "Aucune modification fournie" });
    }

    params.push(userId);
    const result = await pool.query(
      `UPDATE utilisateurs SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING id, nom, email, role, telephone, telephone_verified, auth_version`,
      params
    );

    const response = { message: "Profil mis à jour", user: result.rows[0] };
    if (passwordChanged) {
      // L'appareil courant reçoit un jeton frais ; les autres sessions restent révoquées.
      response.token = signAuthToken(
        {
          id: result.rows[0].id,
          role: result.rows[0].role,
          auth_version: Number.isInteger(result.rows[0].auth_version) ? result.rows[0].auth_version : 0,
        },
        "12h"
      );
    }
    res.json(response);
  } catch (err) {
    console.error('Erreur update profil:', err);
    res.status(500).json({ error: "Erreur lors de la mise à jour du profil" });
  }
});

// --- Mot de passe oublié (jeton opaque à usage unique, valable 15 min) ---
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email requis" });

  try {
    const user = await pool.query("SELECT id, nom, email FROM utilisateurs WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return res.json({ success: true, message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
    }

    // Seule une empreinte SHA-256 du jeton est stockée en base : une fuite de
    // la base ne permet pas de réutiliser les liens de réinitialisation.
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await pool.query(
      "UPDATE utilisateurs SET password_reset_token_hash = $1, password_reset_expires_at = $2 WHERE id = $3",
      [tokenHash, expiresAt, user.rows[0].id]
    );

    await EmailService.sendResetPassword(user.rows[0].nom, user.rows[0].email, rawToken);
    logger.info('forgot-password envoyé', { email: user.rows[0].email });
    res.json({ success: true, message: "Si cet email existe, un lien de réinitialisation a été envoyé." });
  } catch (err) {
    logger.error('forgot-password erreur', { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- Réinitialiser le mot de passe avec le jeton reçu par email ---
router.post("/reset-password", async (req, res) => {
  const { token, mot_de_passe } = req.body;
  if (!token || !mot_de_passe) return res.status(400).json({ error: "Token et mot de passe requis" });

  try {
    const parsedPassword = newPasswordSchema.safeParse(mot_de_passe);
    if (!parsedPassword.success) {
      return res.status(400).json({
        error: parsedPassword.error.issues?.[0]?.message || "Mot de passe invalide",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");
    const users = await pool.query(
      "SELECT id FROM utilisateurs WHERE password_reset_token_hash = $1 AND password_reset_expires_at > now()",
      [tokenHash]
    );
    if (users.rows.length === 0) {
      return res.status(400).json({ error: "Token invalide ou expiré" });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    // Usage unique : le jeton est effacé, et auth_version révoque les sessions existantes.
    await pool.query(
      `UPDATE utilisateurs
       SET mot_de_passe_hash = $1,
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL,
           auth_version = COALESCE(auth_version, 0) + 1
       WHERE id = $2`,
      [hash, users.rows[0].id]
    );
    logger.info('mot de passe réinitialisé', { userId: users.rows[0].id });
    res.json({ success: true, message: "Mot de passe mis à jour. Vous pouvez vous connecter." });
  } catch (err) {
    logger.error('reset-password erreur', { message: err.message });
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;

