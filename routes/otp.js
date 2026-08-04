import express from 'express';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
const router = express.Router();

// --- Activer l'OTP (générer secret + QR code) ---
router.post('/enable', verifyToken, async (req, res) => {
  const userId = req.user.id;
  
  // Générer un secret TOTP
  const secret = speakeasy.generateSecret({
    name: `BTT-LUX (${req.user.email})`,
    length: 20
  });
  
  // Sauvegarder en base
  await pool.query(
    `INSERT INTO otp_secrets (utilisateur_id, secret, enabled) VALUES ($1, $2, $3)
     ON CONFLICT (utilisateur_id) DO UPDATE SET secret = $2, enabled = false`,
    [userId, secret.base32, false]
  );
  
  // Générer le QR code (URL otpauth)
  const otpauth_url = secret.otpauth_url;
  const qrCodeDataUrl = await qrcode.toDataURL(otpauth_url);
  
  res.json({
    secret: secret.base32,
    qrCode: qrCodeDataUrl,
    otpauth_url
  });
});

// --- Vérifier et activer l'OTP ---
router.post('/verify', verifyToken, async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;
  
  const secretRecord = await pool.query('SELECT secret FROM otp_secrets WHERE utilisateur_id = $1', [userId]);
  if (!secretRecord.rows.length) return res.status(400).json({ error: 'OTP non initialisé' });
  
  const secret = secretRecord.rows[0].secret;
  const verified = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2 // Tolérance de 2 intervalles de 30s
  });
  
  if (!verified) return res.status(401).json({ error: 'Code OTP invalide' });
  
  // Activer l'OTP
  await pool.query('UPDATE otp_secrets SET enabled = true WHERE utilisateur_id = $1', [userId]);
  res.json({ message: 'OTP activé avec succès' });
});

// --- Désactiver l'OTP (admin seulement, ou par l'utilisateur) ---
router.post('/disable', verifyToken, async (req, res) => {
  const userId = req.user.id;
  await pool.query('UPDATE otp_secrets SET enabled = false WHERE utilisateur_id = $1', [userId]);
  res.json({ message: 'OTP désactivé' });
});

// --- Vérifier l'OTP pendant le login (appelé par login) ---
// Ceci est intégré dans auth.js, mais je garde une route pour le 2FA
router.post('/check', async (req, res) => {
  const { email, token } = req.body;
  const user = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
  if (!user.rows.length) return res.status(404).json({ error: 'Utilisateur inconnu' });
  
  const secretRecord = await pool.query('SELECT secret, enabled FROM otp_secrets WHERE utilisateur_id = $1', [user.rows[0].id]);
  if (!secretRecord.rows.length || !secretRecord.rows[0].enabled) {
    return res.json({ otp_required: false });
  }
  
  const verified = speakeasy.totp.verify({
    secret: secretRecord.rows[0].secret,
    encoding: 'base32',
    token: token,
    window: 2
  });
  
  if (!verified) return res.status(401).json({ error: 'Code OTP invalide' });
  res.json({ otp_required: true, valid: true });
});

export default router;