/**
 * migrate.js — Applique les migrations idempotentes à la base BTT-LUX.
 * Utilisation :  node migrate.js
 *
 * Chaque migration est un tableau de requêtes DDL "IF NOT EXISTS" / idempotentes.
 */
import pool from './db.js';

const MIGRATIONS = [
  {
    name: '2026-08-26_utilisateurs_telephone_verified',
    queries: [
      `ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone_verified BOOLEAN DEFAULT false`,
    ],
  },
  {
    name: '2026-08-26_paiements_payment_data',
    queries: [
      `ALTER TABLE paiements ADD COLUMN IF NOT EXISTS payment_data JSONB`,
      `ALTER TABLE paiements ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100)`,
    ],
  },
  {
    name: '2026-08-26_notifications_index',
    queries: [
      `CREATE INDEX IF NOT EXISTS idx_notifications_utilisateur ON notifications(utilisateur_id)`,
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
      const done = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [migration.name]);
      if (done.rows.length) {
        console.log(`↩️  ${migration.name} : déjà appliquée`);
        continue;
      }
      await client.query('BEGIN');
      for (const q of migration.queries) {
        await client.query(q);
      }
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      await client.query('COMMIT');
      console.log(`✅ ${migration.name} : appliquée`);
    }
    console.log('\n🎉 Migrations à jour.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur migration :', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();