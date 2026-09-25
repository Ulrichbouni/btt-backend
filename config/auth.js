import jwt from "jsonwebtoken";

const DEFAULT_DEV_SECRET = "development-only-change-me-32-chars-minimum";

export function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret) {
    // Un secret court rend les tokens (dont email_verification) falsifiables
    // par force brute : on exige 256 bits d'entropie minimum.
    if (secret.length < 32) {
      const msg = `JWT_SECRET trop court (${secret.length} caractères, 32 minimum) — régénérez avec : openssl rand -hex 32`;
      if (process.env.NODE_ENV === "production") {
        throw new Error(msg);
      }
      console.warn(`[auth] ${msg}`);
    }
    if (
      process.env.NODE_ENV === "production" &&
      secret === "changez-moi-par-une-longue-chaine-aleatoire"
    ) {
      throw new Error(
        "JWT_SECRET utilise encore la valeur d'exemple — générez-la avec : openssl rand -hex 32",
      );
    }
    return secret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET doit être configuré en production");
  }
  return DEFAULT_DEV_SECRET;
}

export function signAuthToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function currentAuthVersion(user) {
  return Number.isInteger(user?.auth_version) ? user.auth_version : 0;
}
