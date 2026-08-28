/**
 * checkSchema.js — Compare le schéma réel de la base au fichier schema.sql (informations_schema).
 * Vérifie que chaque table + colonne attendue existe.
 *
 * Utilisation :  node checkSchema.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Extraction (simple) des CREATE TABLE definitions du fichier schema.sql
function parseExpectedTables(sql) {
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;
  const tables = {};
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const cols = m[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\w+/.test(l) && !/CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CREATE/.test(l))
      .map((l) => l.split(/\s+/)[0]);
    tables[name] = cols;
  }
  return tables;
}

async function main() {
  try {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    const expected = parseExpectedTables(sql);
    let errors = 0;

    for (const [table, cols] of Object.entries(expected)) {
      const { rows } = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
        [table]
      );
      const actual = new Set(rows.map((r) => r.column_name));
      const missing = cols.filter((c) => !actual.has(c));
      if (missing.length) {
        console.log(`❌ ${table} : colonnes manquantes -> ${missing.join(', ')}`);
        errors++;
      } else {
        console.log(`✅ ${table} : OK (${cols.length} colonnes attendues)`);
      }
    }

    if (errors) {
      console.log(`\n⚠️ ${errors} incohérence(s) trouvée(s).`);
      process.exitCode = 1;
    } else {
      console.log('\n✅ Schéma conforme (table+colonnes attendues présentes).');
    }
  } catch (err) {
    console.error('❌ Erreur :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();