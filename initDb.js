/**
 * initDb.js — Initialise la base de données BTT-LUX.
 * Exécute schema.sql (CREATE TABLE IF NOT EXISTS) — idempotent.
 *
 * Utilisation :  node initDb.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🚀 Initialisation de la base BTT-LUX...');
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Schéma appliqué avec succès.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur lors de l\'initialisation :', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();