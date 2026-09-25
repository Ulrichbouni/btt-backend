// Tests du backend SQL de services/otp-email-store.js — le chemin utilisé en
// production (OTP_STORE=sql), que les autres tests n'exercent jamais car ils
// forcent le backend mémoire.
//
// Ces tests écrivent réellement en base. Chaque cas utilise une adresse
// unique et la ligne est purgee en fin de test, donc la suite est rejouable
// et ne laisse rien derriere elle.
//
// Si la table email_otp_codes n'existe pas encore (base non migree), les
// tests sont ignores plutot que de faire echouer la suite :
//   npm run db:migrate

process.env.OTP_STORE = "sql";
process.env.NODE_ENV = "test";

const { default: pool } = await import("../../db.js");
const {
  MAX_ATTEMPTS,
  OTP_TTL_MS,
  consumeOtpCode,
  otpCodeMatches,
  readOtpEntry,
  registerOtpFailure,
  storeOtpCode,
} = await import("../../services/otp-email-store.js");

// Detection faite au chargement du module (donc avant la collecte) pour que
// `it` puisse etre conditionne a la presence effective de la table.
let hasTable = false;
try {
  const { rows } = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'email_otp_codes'",
  );
  hasTable = rows.length > 0;
} catch {
  hasTable = false;
}

const sqlIt = hasTable ? it : it.skip;

const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const emailFor = (name) => `${name}_${stamp}@example.com`;
const writtenEmails = [];
const track = (email) => {
  writtenEmails.push(email);
  return email;
};
const readRawRow = (email) =>
  pool.query("SELECT * FROM email_otp_codes WHERE email = $1", [email]);

afterAll(async () => {
  if (writtenEmails.length) {
    await pool.query("DELETE FROM email_otp_codes WHERE email = ANY($1)", [
      writtenEmails,
    ]);
  }
  await pool.end();
});

describe("OTP email — backend SQL", () => {
  sqlIt("stocke une empreinte HMAC et jamais le code en clair", async () => {
    const email = track(emailFor("sql_hash"));
    await storeOtpCode(email, "123456");

    const { rows } = await readRawRow(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].code_hash).not.toBe("123456");
    expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].attempts).toBe(0);
  });

  sqlIt("relit l'empreinte et la compare correctement", async () => {
    const email = track(emailFor("sql_read"));
    await storeOtpCode(email, "654321");

    const entry = await readOtpEntry(email);
    expect(entry).not.toBeNull();
    expect(entry.attempts).toBe(0);
    expect(otpCodeMatches(email, "654321", entry.codeHash)).toBe(true);
    expect(otpCodeMatches(email, "111111", entry.codeHash)).toBe(false);
  });

  sqlIt("convertit expires_at en millisecondes et respecte le TTL", async () => {
    const email = track(emailFor("sql_ttl"));
    await storeOtpCode(email, "222222");

    const entry = await readOtpEntry(email);
    const remaining = entry.exp - Date.now();
    expect(remaining).toBeGreaterThan(OTP_TTL_MS - 60 * 1000);
    expect(remaining).toBeLessThanOrEqual(OTP_TTL_MS);
  });

  sqlIt("incrémente les tentatives échouées", async () => {
    const email = track(emailFor("sql_attempts"));
    await storeOtpCode(email, "333333");

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await registerOtpFailure(email);
    }
    expect((await readOtpEntry(email)).attempts).toBe(MAX_ATTEMPTS);
  });

  sqlIt("remplace le code et remet le compteur à zéro", async () => {
    const email = track(emailFor("sql_upsert"));
    await storeOtpCode(email, "444444");
    await registerOtpFailure(email);
    await registerOtpFailure(email);
    expect((await readOtpEntry(email)).attempts).toBe(2);

    await storeOtpCode(email, "555555");
    const entry = await readOtpEntry(email);
    expect(entry.attempts).toBe(0);
    expect(otpCodeMatches(email, "555555", entry.codeHash)).toBe(true);
    expect(otpCodeMatches(email, "444444", entry.codeHash)).toBe(false);
  });

  sqlIt("purge la ligne après consommation", async () => {
    const email = track(emailFor("sql_consume"));
    await storeOtpCode(email, "666666");
    expect(await readOtpEntry(email)).not.toBeNull();

    await consumeOtpCode(email);
    expect(await readOtpEntry(email)).toBeNull();
    expect((await readRawRow(email)).rows).toHaveLength(0);
  });

  sqlIt("efface une ligne expirée et la renvoie comme absente", async () => {
    const email = track(emailFor("sql_expired"));
    await storeOtpCode(email, "777777");
    // Expiration forcée : on rejoue le cas d'un code arrivé à échéance.
    await pool.query(
      "UPDATE email_otp_codes SET expires_at = now() - interval '1 minute' WHERE email = $1",
      [email],
    );

    expect(await readOtpEntry(email)).toBeNull();
    // La ligne doit avoir été supprimée, pas seulement masquée.
    expect((await readRawRow(email)).rows).toHaveLength(0);
  });

  sqlIt("retourne null pour une adresse jamais demandée", async () => {
    expect(await readOtpEntry(emailFor("sql_unknown"))).toBeNull();
  });
});
