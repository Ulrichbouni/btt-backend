import pool from "./db.js";

/**
 * migrate.js — Applique les migrations idempotentes à la base BTT-LUX.
 * Utilisation :  node migrate.js
 *
 * Chaque migration est un tableau de requêtes DDL "IF NOT EXISTS" / idempotentes.
 */
const MIGRATIONS = [
  {
    name: "2026-09-25_auth_security",
    queries: [
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT`,
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ`,
    ],
  },
  {
    name: "2026-09-17_chantiers_photos",
    queries: [
      `ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS photos_avant JSONB DEFAULT '[]'::jsonb`,
      `ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS photos_apres JSONB DEFAULT '[]'::jsonb`,
      `CREATE INDEX IF NOT EXISTS idx_chantiers_etape ON chantiers(etape)`,
    ],
  },
  {
    name: "2026-08-26_utilisateurs_telephone_verified",
    queries: [
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone_verified BOOLEAN DEFAULT false`,
    ],
  },
  {
    name: "2026-08-26_paiements_payment_data",
    queries: [
      `ALTER TABLE paiements ADD COLUMN IF NOT EXISTS payment_data JSONB`,
      `ALTER TABLE paiements ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100)`,
    ],
  },
  {
    name: "2026-08-26_notifications_index",
    queries: [
      `CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id)`,
    ],
  },
  {
    name: "2026-09-17_devis_produit_id",
    queries: [
      `ALTER TABLE devis ADD COLUMN IF NOT EXISTS produit_id INTEGER REFERENCES produits(id)`,
    ],
  },
  {
    name: "2026-09-25_utilisateurs_email_verified",
    queries: [
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`,
    ],
  },
  {
    // Stockage OTP email : HMAC-SHA-256 avec une clé serveur, jamais en clair.
    name: "2026-09-25_email_otp_codes",
    queries: [
      `CREATE TABLE IF NOT EXISTS email_otp_codes (
        email VARCHAR(255) PRIMARY KEY,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_email_otp_codes_expires ON email_otp_codes(expires_at)`,
    ],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT now()
    )`);

    for (const migration of MIGRATIONS) {
      const done = await client.query(
        "SELECT 1 FROM _migrations WHERE name = $1",
        [migration.name],
      );
      if (done.rows.length) {
        console.log(`↩️  ${migration.name} : déjà appliquée`);
        continue;
      }
      await client.query("BEGIN");
      for (const q of migration.queries) {
        await client.query(q);
      }
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
        migration.name,
      ]);
      await client.query("COMMIT");
      console.log(`✅ ${migration.name} : appliquée`);
    }
    console.log("\n🎉 Migrations à jour.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erreur migration :", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
