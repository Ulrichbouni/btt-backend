/**
 * dumpRealSchema.js — Génère schema.sql depuis la base RÉELLE.
 * Ce script interroge information_schema et pg_constraint pour
 * reconstruire CREATE TABLE IF NOT EXISTS idempotents.
 *
 * Utilisation :  node dumpRealSchema.js
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXCLUDE = ['pg_catalog', 'information_schema'];

function pgType(dataType, udtName, charMax) {
  switch (udtName) {
    case 'uuid': return 'UUID';
    case 'int4': return 'INTEGER';
    case 'int8': return 'BIGINT';
    case 'float8': return 'DOUBLE PRECISION';
    case 'bool': return 'BOOLEAN';
    case 'timestamptz': return 'TIMESTAMP';
    case 'jsonb': return 'JSONB';
    case 'varchar':
      return charMax ? `VARCHAR(${charMax})` : 'VARCHAR';
    case 'text': return 'TEXT';
    case '_text': return 'TEXT[]';
    case 'date': return 'DATE';
    default: return udtName.toUpperCase();
  }
}

async function main() {
  try {
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tables = tablesRes.rows.map((r) => r.table_name).filter((t) => !EXCLUDE.includes(t));

    const lines = [];
    lines.push('-- Schéma BTT-LUX (régénéré via node dumpRealSchema.js)');
    lines.push('-- Idempotent : CREATE TABLE IF NOT EXISTS.');
    lines.push('');

    for (const table of tables) {
      const colsRes = await pool.query(
        `SELECT column_name, data_type, udt_name, character_maximum_length,
                column_default, is_nullable
         FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position`,
        [table]
      );

      const cols = colsRes.rows.map((c) => {
        let line = `    ${c.column_name} ${pgType(c.data_type, c.udt_name, c.character_maximum_length)}`;
        if (c.column_default) line += ` DEFAULT ${c.column_default}`;
        if (c.is_nullable === 'NO') line += ' NOT NULL';
        return line;
      });

      const pkRes = await pool.query(
        `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [table]
      );
      if (pkRes.rows.length) {
        cols.push(`    CONSTRAINT ${table}_pkey PRIMARY KEY (${pkRes.rows.map((r) => r.attname).join(', ')})`);
      }

      const fkRes = await pool.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'f'`,
        [table]
      );
      for (const fk of fkRes.rows) {
        cols.push(`    CONSTRAINT ${fk.conname} ${fk.def}`);
      }

      lines.push(`CREATE TABLE IF NOT EXISTS ${table} (`);
      lines.push(cols.join(',\n'));
      lines.push(');');
      lines.push('');
    }

    const output = lines.join('\n');
    writeFileSync(join(__dirname, 'schema.sql'), output, 'utf-8');
    console.log(`✅ schema.sql régénéré (${tables.length} tables).`);
  } catch (err) {
    console.error('❌ Erreur dump :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();