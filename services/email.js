// Service d'envoi d'emails transactionnels — OTP gratuit via Gmail SMTP
// Configurer dans .env :
//   MAIL_USER=bttlux.notifications@gmail.com
//   MAIL_APP_PASS=xxxx xxxx xxxx xxxx  (mot de passe d'application Gmail, 16 car.)
//   MAIL_FROM_NAME=BTT-LUX
// Montage route OTP email (ESM) :
//   import authEmailRoutes from './routes/auth-email.js';
//   app.use('/api', authEmailRoutes);

// Fournisseurs supportés :
// - gmail (défaut) : SMTP Gmail, gratuit, quota ~500 emails/jour.
// - brevo : relais SMTP smtp-relay.brevo.com:587, ~300/jour gratuit,
//   meilleure délivrabilité. Vars : BREVO_SMTP_USER / BREVO_SMTP_KEY.
// - resend : API HTTP https://api.resend.com/emails, ~3000/mois gratuit,
//   meilleure délivrabilité. Vars : RESEND_API_KEY + EMAIL_FROM (domaine vérifié).
// Sélection via EMAIL_PROVIDER=gmail|brevo|resend.
//
// Garde-fou quota : EMAIL_DAILY_MAX (défaut 450 < 500 Gmail) limite le nombre
// total d'envois / 24h glissantes, tous emails confondus. Au-delà, les envois
// lèvent EmailQuotaExceededError (la route OTP répond 503 + Retry-After).
// Quand le volume dépasse durablement le quota gratuit, basculez EMAIL_PROVIDER
// sur 'resend' (ou 'brevo') au lieu d'augmenter le plafond Gmail.

import nodemailer from "nodemailer";
import logger from "./logger.js";

const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
const sentTimestamps = [];

export class EmailQuotaExceededError extends Error {
  constructor(message = "Quota journalier d'emails atteint, réessayez plus tard") {
    super(message);
    this.name = "EmailQuotaExceededError";
    this.retryAfterSec = 3600;
  }
}

const getDailyMax = () => {
  const parsed = parseInt(process.env.EMAIL_DAILY_MAX || "450", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 450;
};

const checkQuotaOrThrow = () => {
  const now = Date.now();
  while (sentTimestamps.length && sentTimestamps[0] <= now - QUOTA_WINDOW_MS) {
    sentTimestamps.shift();
  }
  if (sentTimestamps.length >= getDailyMax()) {
    throw new EmailQuotaExceededError();
  }
};

const recordSend = () => {
  sentTimestamps.push(Date.now());
};

const getProvider = () =>
  String(process.env.EMAIL_PROVIDER || "gmail").trim().toLowerCase();

let gmailTransporter;
let gmailTransporterKey;
const getGmailTransporter = () => {
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_APP_PASS;
  if (!user || !pass) return null;
  const key = `${user}\0${pass}`;
  if (!gmailTransporter || gmailTransporterKey !== key) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
    gmailTransporterKey = key;
  }
  return gmailTransporter;
};

let brevoTransporter;
let brevoTransporterKey;
const getBrevoTransporter = () => {
  const user = process.env.BREVO_SMTP_USER;
  const pass = process.env.BREVO_SMTP_KEY;
  if (!user || !pass) return null;
  const key = `${user}\0${pass}`;
  if (!brevoTransporter || brevoTransporterKey !== key) {
    brevoTransporter = nodemailer.createTransport({
      host: "smtp-relay.brevo.com",
      port: 587,
      auth: { user, pass },
    });
    brevoTransporterKey = key;
  }
  return brevoTransporter;
};

const getSmtpTransporter = () => {
  if (getProvider() === "brevo") return getBrevoTransporter();
  return getGmailTransporter();
};

const getFrom = () => {
  if (getProvider() === "resend") {
    return (
      process.env.EMAIL_FROM ||
      (process.env.MAIL_USER ? `"${process.env.MAIL_FROM_NAME || "BTT-LUX"}" <${process.env.MAIL_USER}>` : "BTT-LUX <onboarding@resend.dev>")
    );
  }
  const user =
    getProvider() === "brevo" ? process.env.BREVO_SMTP_USER : process.env.MAIL_USER;
  return `"${process.env.MAIL_FROM_NAME || "BTT-LUX"}" <${process.env.EMAIL_FROM || user}>`;
};

const sendViaResend = async (options) => {
  if (!process.env.RESEND_API_KEY) return null;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFrom(),
      to: [options.to],
      subject: options.subject,
      html: options.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend refusé (HTTP ${res.status}) : ${body.slice(0, 200)}`);
  }
  return res.json().then((data) => {
    if (!data?.id) throw new Error("Réponse Resend invalide (id manquant)");
    return data;
  }).catch((err) => {
    if (err instanceof SyntaxError) throw new Error("Réponse Resend JSON invalide");
    throw err;
  });
};

const wrap = (title, body) => `
<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,.05)">
    <h2 style="color:#92400e;margin:0 0 16px;font-size:22px">${title}</h2>
    ${body}
    <hr style="border:none;border-top:1px solid #f3e8d4;margin:24px 0"/>
    <p style="color:#9ca3af;font-size:12px;margin:0">
      BTT-LUX · Begueni Timber Trading · Luxerboard<br/>
      Cet email est automatique, merci de ne pas y répondre.
    </p>
  </div>
</body></html>`;

const sendMailSafe = async (options) => {
  // Garde-fou quota AVANT tout envoi (même mocké : un attaquant ne doit pas
  // pouvoir générer du volume gratuitement).
  checkQuotaOrThrow();

  // En test : aucun envoi réel. Sans ce garde-fou, les tests d'intégration
  // déclenchent de vrais emails (ex. email de bienvenue à /register) vers des
  // adresses factices, ce qui consomme le quota du compte SMTP et génère des
  // rebonds. Les tests doivent valider la logique, pas le réseau.
  if (process.env.NODE_ENV === "test") {
    logger.info("[email] envoi simulé (NODE_ENV=test)", {
      to: options?.to,
      subject: options?.subject,
    });
    return { success: true, mock: true };
  }

  if (getProvider() === "resend") {
    if (!process.env.RESEND_API_KEY) {
      const msg = "Resend non configuré (RESEND_API_KEY manquant)";
      if (process.env.NODE_ENV === "production") {
        logger.error(`[email] ${msg}`, { to: options?.to, subject: options?.subject });
        throw new Error(msg);
      }
      logger.warn(`[email] ${msg} — envoi ignoré`);
      return { success: false, mock: true };
    }
    const sent = await sendViaResend(options);
    recordSend();
    logger.info("[email] envoyé via resend", { to: options?.to });
    return { success: true, messageId: sent?.id };
  }

  const transporter = getSmtpTransporter();
  if (!transporter) {
    const msg = `SMTP ${getProvider()} non configuré — envoi ignoré`;
    if (process.env.NODE_ENV === "production") {
      logger.error(msg, { to: options?.to, subject: options?.subject });
      throw new Error(msg);
    }
    logger.warn(msg, { to: options?.to, subject: options?.subject });
    return { success: false, mock: true };
  }
  const info = await transporter.sendMail({ from: getFrom(), ...options });
  recordSend();
  logger.info("[email] envoye", { to: options?.to, provider: getProvider() });
  return { success: true, messageId: info?.messageId };
};

export const sendOtpEmail = async (to, code) => {
  return sendMailSafe({
    to,
    subject: "Votre code de vérification BTT-LUX",
    html: wrap(
      "Vérification de votre compte",
      `
      <p style="color:#374151;font-size:15px">Utilisez le code ci-dessous :</p>
      <div style="text-align:center;margin:24px 0">
        <span style="display:inline-block;font-size:34px;font-weight:800;letter-spacing:10px;color:#b45309;background:#fef3c7;padding:14px 22px;border-radius:10px">${code}</span>
      </div>
      <p style="color:#6b7280;font-size:13px">Ce code expire dans <b>10 minutes</b>.</p>
      `,
    ),
  });
};

export const sendWelcomeEmail = async (to, nom) => {
  return sendMailSafe({
    to,
    subject: "Bienvenue chez BTT-LUX",
    html: wrap(
      "Bienvenue",
      `
      <p style="color:#374151;font-size:15px">Bonjour ${nom || ""},</p>
      <p style="color:#374151;font-size:15px">Votre compte BTT-LUX est active.</p>
      `,
    ),
  });
};

export const verifyTransport = async () => {
  if (getProvider() === "resend") {
    if (!process.env.RESEND_API_KEY) throw new Error("Resend non configure (RESEND_API_KEY)");
    return true;
  }
  const transporter = getSmtpTransporter();
  if (!transporter) throw new Error(`SMTP ${getProvider()} non configure`);
  await transporter.verify();
};

// Alias historique utilise par routes/auth.js : sendWelcome(nom, email)
export const sendWelcome = async (nom, email) => {
  const looksLikeEmail = (v) => typeof v === "string" && v.includes("@");
  const to = looksLikeEmail(email) ? email : looksLikeEmail(nom) ? nom : email;
  const name = to === nom ? email : nom;
  return sendWelcomeEmail(to, name);
};

export const sendResetPassword = async (nom, email, rawToken) => {
  const base = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  const link = base
    ? `${base}/reset-password?token=${encodeURIComponent(rawToken)}`
    : `/reset-password?token=${encodeURIComponent(rawToken)}`;
  return sendMailSafe({
    to: email,
    subject: "Reinitialisation mot de passe BTT-LUX",
    html: wrap(`Mot de passe oublie`, `<p>Bonjour ${nom || ""},</p><p><a href="${link}">Reinitialiser</a> (15 min).</p><p>${link}</p>`),
  });
};

export const sendDevisConfirmation = async (to, nom, devisId, montant) => {
  const montantTxt = Number(montant || 0).toLocaleString("fr-FR");
  return sendMailSafe({
    to,
    subject: `Demande de devis #${devisId} BTT-LUX`,
    html: wrap(`Devis recu`, `<p>Bonjour ${nom || ""},</p><p>Devis <b>#${devisId}</b> recu. Estimation : <b>${montantTxt} FCFA</b>.</p>`),
  });
};

const EmailService = {
  sendOtpEmail,
  sendWelcomeEmail,
  sendWelcome,
  sendResetPassword,
  sendDevisConfirmation,
  verifyTransport,
};

export default EmailService;
