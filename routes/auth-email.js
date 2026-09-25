// Routes OTP par EMAIL — gratuites via Gmail SMTP (ou Brevo / Resend).
// Montage dans server.js (ESM) :
//   import authEmailRoutes from './routes/auth-email.js';
//   app.use('/api', authEmailRoutes);
// Note : le rate limiting anti-quota est posé dans server.js sur
// /api/auth/request-otp-email (3 demandes / 15 min / IP).

import express from "express";
import crypto from "node:crypto";
import { EmailQuotaExceededError, sendOtpEmail } from "../services/email.js";
import {
  MAX_ATTEMPTS,
  consumeOtpCode,
  otpCodeMatches,
  peekOtpCodeForDebug,
  readOtpEntry,
  registerOtpFailure,
  storeOtpCode,
} from "../services/otp-email-store.js";
import { signAuthToken, verifyAuthToken } from "../config/auth.js";
import logger from "../services/logger.js";

const router = express.Router();

const isValidEmail = (v) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

// ─────────────────────────────────────────────
// POST /auth/request-otp-email
// Body : { email }
// ─────────────────────────────────────────────
router.post("/auth/request-otp-email", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Adresse email invalide" });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  // Stocké hashé (SQL) ou en mémoire (tests) — jamais en clair en base.
  await storeOtpCode(email, code);

  try {
    await sendOtpEmail(email, code);
    return res.json({ message: "Code envoyé par email", email });
  } catch (err) {
    if (err instanceof EmailQuotaExceededError) {
      await consumeOtpCode(email); // ne pas laisser un code invérifiable
      res.set("Retry-After", String(err.retryAfterSec || 3600));
      return res.status(503).json({ error: err.message });
    }
    logger.error("[request-otp-email] Erreur envoi", { message: err.message });
    await consumeOtpCode(email);
    return res
      .status(500)
      .json({ error: "Envoi du code impossible, réessayez plus tard" });
  }
});

// ── DEV UNIQUEMENT : lire le code OTP (jamais en prod) ──
// Exige ALLOW_OTP_DEBUG=true ET un environnement non-production. En SQL,
// l'empreinte reste irréversible : cette route ne peut pas lire le code.
const otpDebugEnabled = () =>
  process.env.ALLOW_OTP_DEBUG === "true" &&
  process.env.NODE_ENV !== "production";

if (otpDebugEnabled()) {
  router.get("/auth/debug-otp-email", async (req, res) => {
    const email = String(req.query?.email || "").trim().toLowerCase();
    const code = await peekOtpCodeForDebug(email);
    if (!code) return res.status(404).json({ error: "Aucun code lisible pour cet email (backend SQL : hash irréversible)" });
    return res.json({ email, code });
  });
}

// ─────────────────────────────────────────────
// POST /auth/verify-otp-email
// Body : { email, code }
// Renvoie : { email_verification_token }
// ─────────────────────────────────────────────
router.post("/auth/verify-otp-email", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const code = String(req.body?.code || "").trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: "Email ou code invalide" });
  }

  const entry = await readOtpEntry(email);
  if (!entry) {
    return res
      .status(400)
      .json({ error: "Aucun code en attente pour cet email" });
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    await consumeOtpCode(email);
    return res
      .status(429)
      .json({ error: "Trop de tentatives, redemandez un code" });
  }

  const match = otpCodeMatches(email, code, entry.codeHash);

  if (!match) {
    await registerOtpFailure(email);
    return res.status(400).json({ error: "Code incorrect" });
  }

  await consumeOtpCode(email); // usage unique

  const token = signAuthToken({ email, scope: "email_verification" }, "15m");

  return res.json({ email_verification_token: token, email });
});

// ─────────────────────────────────────────────
// Helper exporté pour être utilisé dans /auth/register
// ─────────────────────────────────────────────
export const verifyEmailToken = (token) => {
  try {
    const payload = verifyAuthToken(token);
    if (payload.scope !== "email_verification") return null;
    return payload.email || null;
  } catch {
    return null;
  }
};

export default router;
