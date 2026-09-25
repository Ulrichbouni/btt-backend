// Stockage des codes OTP email.
// - 'memory' (défaut hors prod / tests) : Map en mémoire, purge toutes les 60s.
// - 'sql' (recommandé en prod) : table email_otp_codes (voir migrate.js +
//   schema.sql), partage entre instances et durable. Codes sous forme
//   d'empreinte HMAC-SHA-256 liée à l'email et à JWT_SECRET.
// Sélection via OTP_STORE=sql|memory (défaut : sql en production, memory sinon).

import crypto from "node:crypto";
import pool from "../db.js";
import { getJwtSecret } from "../config/auth.js";
import logger from "./logger.js";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;

// Codes stockés sous forme d'empreinte HMAC-SHA-256 calculée avec JWT_SECRET.
// Même avec une fuite de la base, un attaquant doit retrouver le code et la
// clé serveur ; il ne peut pas pré-calculer le domaine des 6 chiffres.
const hashCode = (email, code) =>
  crypto
    .createHmac("sha256", getJwtSecret())
    .update(`${String(email).trim().toLowerCase()}\0${String(code)}`)
    .digest("hex");

/** Comparaison constante à temps d'un code à son empreinte HMAC stockée. */
export function otpCodeMatches(email, code, expectedHash) {
  const candidateHash = Buffer.from(hashCode(email, code), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  if (expected.length !== candidateHash.length) return false;
  return crypto.timingSafeEqual(candidateHash, expected);
}

// ── Backend mémoire ──
const memoryStore = new Map(); // email -> { codeHash, exp, attempts }

setInterval(() => {
  const now = Date.now();
  for (const [email, entry] of memoryStore) {
    if (entry.exp < now) memoryStore.delete(email);
  }
}, 60 * 1000).unref?.();

const memoryBackend = {
  async set(email, code, exp) {
    memoryStore.set(email, { codeHash: hashCode(email, code), exp, attempts: 0 });
  },
  async get(email) {
    const entry = memoryStore.get(email);
    if (!entry) return null;
    if (entry.exp < Date.now()) {
      memoryStore.delete(email);
      return null;
    }
    return { ...entry };
  },
  async incrementAttempts(email) {
    const entry = memoryStore.get(email);
    if (entry) entry.attempts += 1;
  },
  async consume(email) {
    memoryStore.delete(email);
  },
  async peekCodeForDebug(email) {
    // Le hash seul ne permet pas de retrouver le code : le debug local
    // nécessite le code en clair, conservé uniquement dans ce backend dev.
    return memoryStore.get(email)?.debugCode ?? null;
  },
  async setDebugCode(email, code) {
    const entry = memoryStore.get(email);
    if (entry) entry.debugCode = code;
  },
};

// ── Backend SQL ──
const sqlBackend = {
  async set(email, code, exp) {
    await pool.query(
      `INSERT INTO email_otp_codes (email, code_hash, attempts, expires_at)
       VALUES ($1, $2, 0, to_timestamp($3 / 1000.0))
       ON CONFLICT (email) DO UPDATE
       SET code_hash = EXCLUDED.code_hash, attempts = 0, expires_at = EXCLUDED.expires_at`,
      [email, hashCode(email, code), exp],
    );
  },
  async get(email) {
    const { rows } = await pool.query(
      "SELECT code_hash AS \"codeHash\", attempts, EXTRACT(EPOCH FROM expires_at) * 1000 AS exp FROM email_otp_codes WHERE email = $1",
      [email],
    );
    if (!rows.length) return null;
    const entry = { ...rows[0], exp: Number(rows[0].exp) };
    if (entry.exp < Date.now()) {
      await this.consume(email);
      return null;
    }
    return entry;
  },
  async incrementAttempts(email) {
    await pool.query(
      "UPDATE email_otp_codes SET attempts = attempts + 1 WHERE email = $1",
      [email],
    );
  },
  async consume(email) {
    await pool.query("DELETE FROM email_otp_codes WHERE email = $1", [email]);
  },
  async peekCodeForDebug() {
    return null; // hash irréversible : pas de lecture possible, même en debug
  },
  async setDebugCode() {},
};

// Purge périodique des codes expirés (SQL uniquement ; la mémoire se purge
// à la lecture + intervalle ci-dessus).
setInterval(() => {
  if (useSql()) {
    pool
      .query("DELETE FROM email_otp_codes WHERE expires_at < now()")
      .catch((err) =>
        logger.warn("[otp-email] purge SQL échouée", { message: err.message }),
      );
  }
}, 5 * 60 * 1000).unref?.();

export function useSql() {
  const configured = String(process.env.OTP_STORE || "").trim().toLowerCase();
  if (configured === "sql") return true;
  if (configured === "memory") return false;
  return process.env.NODE_ENV === "production"; // défaut sûr en prod
}

const backend = () => (useSql() ? sqlBackend : memoryBackend);

export async function storeOtpCode(email, code) {
  await backend().set(email, code, Date.now() + OTP_TTL_MS);
  if (
    process.env.ALLOW_OTP_DEBUG === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    await backend().setDebugCode(email, code);
  }
}

export async function readOtpEntry(email) {
  return backend().get(email);
}

export async function registerOtpFailure(email) {
  await backend().incrementAttempts(email);
}

export async function consumeOtpCode(email) {
  await backend().consume(email);
}

/** DEV UNIQUEMENT (ALLOW_OTP_DEBUG=true) : relit le code en clair. */
export async function peekOtpCodeForDebug(email) {
  if (
    process.env.ALLOW_OTP_DEBUG !== "true" ||
    process.env.NODE_ENV === "production"
  ) {
    return null;
  }
  return backend().peekCodeForDebug(email);
}
