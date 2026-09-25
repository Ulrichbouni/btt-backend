// Tests de sécurité du flux OTP par email.
//
// Ciblent le stockage en mémoire (OTP_STORE=memory) pour contrôler les
// tentatives sans base ni envoi d'email réel. Montage isolé de server.js
// pour ne pas subir les rate limiters globaux.
//
// Couvert : absence de code en clair, empreinte liée à l'email, comparaison
// constante, usage unique, portée du token, bornage des tentatives.

import express from "express";
import request from "supertest";
import { createHmac } from "node:crypto";

// Défini avant l'import de la route : le backend du store est choisi à
// l'appel, on force ici un état isolé et prévisible entre les tests.
process.env.OTP_STORE = "memory";
process.env.NODE_ENV = "test";

const { default: authEmailRouter, verifyEmailToken } = await import(
  "../../routes/auth-email.js"
);
const {
  MAX_ATTEMPTS,
  OTP_TTL_MS,
  consumeOtpCode,
  otpCodeMatches,
  readOtpEntry,
  storeOtpCode,
} = await import("../../services/otp-email-store.js");
const { getJwtSecret, signAuthToken, verifyAuthToken } = await import(
  "../../config/auth.js"
);

const app = express();
app.use(express.json());
app.use("/api", authEmailRouter);

const EMAIL = "otp-security@example.com";

const hashOf = (email, code) =>
  createHmac("sha256", getJwtSecret())
    .update(`${email.trim().toLowerCase()}\0${code}`)
    .digest("hex");

afterEach(async () => {
  await consumeOtpCode(EMAIL);
});

describe("OTP email — stockage et empreinte", () => {
  it("ne conserve jamais le code en clair", async () => {
    await storeOtpCode(EMAIL, "123456");
    const entry = await readOtpEntry(EMAIL);

    expect(entry).not.toBeNull();
    expect(entry.codeHash).toEqual(expect.any(String));
    expect(entry.codeHash).toHaveLength(64); // hex sha256
    expect(entry.codeHash).not.toContain("123456");
  });

  it("valide le bon code et rejette les autres", async () => {
    await storeOtpCode(EMAIL, "123456");
    const { codeHash } = await readOtpEntry(EMAIL);

    expect(otpCodeMatches(EMAIL, "123456", codeHash)).toBe(true);
    expect(otpCodeMatches(EMAIL, "123457", codeHash)).toBe(false);
    expect(otpCodeMatches(EMAIL, "", codeHash)).toBe(false);
  });

  it("lie l'empreinte à l'email (code d'un autre email rejeté)", async () => {
    await storeOtpCode(EMAIL, "123456");
    const { codeHash } = await readOtpEntry(EMAIL);

    expect(otpCodeMatches("pirate@example.com", "123456", codeHash)).toBe(
      false,
    );
  });

  it("purge le code après consommation", async () => {
    expect(OTP_TTL_MS).toBe(10 * 60 * 1000);
    await storeOtpCode(EMAIL, "123456");
    expect(await readOtpEntry(EMAIL)).not.toBeNull();

    await consumeOtpCode(EMAIL);
    expect(await readOtpEntry(EMAIL)).toBeNull();
  });

  it("produit une empreinte HMAC déterministe", () => {
    expect(hashOf(EMAIL, "123456")).toBe(hashOf(EMAIL, "123456"));
    expect(hashOf(EMAIL, "123456")).not.toBe(hashOf(EMAIL, "654321"));
  });
});

describe("POST /api/auth/verify-otp-email", () => {
  it("rejette un email ou un code mal formé", async () => {
    await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: "pas-un-email", code: "123456" })
      .expect(400);

    await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "abc" })
      .expect(400);
  });

  it("refuse de vérifier sans code en attente", async () => {
    await consumeOtpCode(EMAIL);
    const res = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Aucun code en attente/i);
  });

  it("refuse un code incorrect sans révéler d'information", async () => {
    await storeOtpCode(EMAIL, "123456");
    const res = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "999999" });

    expect(res.status).toBe(400);
    // Le message ne distingue pas "email inconnu" de "code faux".
    expect(res.body.error).toBe("Code incorrect");
    expect(res.body.email_verification_token).toBeUndefined();
  });

  it("retourne un token email_verification de 15 minutes", async () => {
    await storeOtpCode(EMAIL, "123456");
    const res = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("email_verification_token");
    expect(res.body.email).toBe(EMAIL);

    const payload = verifyAuthToken(res.body.email_verification_token);
    expect(payload.scope).toBe("email_verification");
    expect(payload.email).toBe(EMAIL);
    expect(payload).not.toHaveProperty("telephone");
    expect(payload.purpose).toBeUndefined(); // jamais un token téléphone
    expect(payload.exp - payload.iat).toBeGreaterThanOrEqual(14 * 60);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(16 * 60);
  });

  it("consomme le code : usage unique", async () => {
    await storeOtpCode(EMAIL, "123456");

    const first = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });
    expect(replay.status).toBe(400);
    expect(replay.body).not.toHaveProperty("email_verification_token");
  });

  it("bloque après MAX_ATTEMPTS échoués", async () => {
    await storeOtpCode(EMAIL, "123456");

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const res = await request(app)
        .post("/api/auth/verify-otp-email")
        .send({ email: EMAIL, code: "000000" });
      expect(res.status).toBe(400);
    }

    // Tentative suivante : trop de tentatives, le code est purgé.
    const blocked = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });
    expect(blocked.status).toBe(429);
    expect(await readOtpEntry(EMAIL)).toBeNull();
  });
});

describe("verifyEmailToken — portée du token", () => {
  it("accepte un token email_verification valide", async () => {
    await storeOtpCode(EMAIL, "123456");
    const res = await request(app)
      .post("/api/auth/verify-otp-email")
      .send({ email: EMAIL, code: "123456" });

    expect(verifyEmailToken(res.body.email_verification_token)).toBe(EMAIL);
  });

  it("rejette un token falsifié", () => {
    const forged =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
      "eyJlbWFpbCI6ImF0dGFja2VyQGV4YW1wbGUuY29tIiwic2NvcGUiOiJlbWFpbF92ZXJpZmljYXRpb24ifQ." +
      "signature-bidon";
    expect(verifyEmailToken(forged)).toBeNull();
  });

  it("rejette un token de session (mauvais scope)", () => {
    const sessionToken = signAuthToken({ id: 1, scope: "auth" }, "15m");
    expect(verifyEmailToken(sessionToken)).toBeNull();
  });
});

