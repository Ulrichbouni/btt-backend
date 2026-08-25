import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db.js';

/**
 * Verification de la STRUCTURE de la base contre schema.sql (lecture seule).
 *   npm run db:schema
 *
 * Controles :
 *   - tables attendues presentes
 *   - colonnes : presence, type, longueur/precision, nullabilite, cle primaire
 *   - index declares dans schema.sql presents en base
 *
 * Sortie : rapport detaille + suggestions ALTER TABLE (non executees).
 * Exit : 0 conforme | 1 ecarts | 2 erreur de connexion.
 */

// --------------------------- parsing du DDL (schema.sql = source de verite) --

function splitTopLevel(body) {
  const parts = [];
  let cur = '';
  let depth = 0;
  let inQuote = false;
  for (const ch of body) {
    if (ch === "'") inQuote = !inQuote;
    if (!inQuote && ch === '(') depth++;
    if (!inQuote && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !inQuote) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(s => s.trim()).filter(Boolean);
}

const TYPE_MAP = {
  SERIAL: 'int4', BIGSERIAL: 'int8', SMALLINT: 'int2', INTEGER: 'int4', INT: 'int4',
  BIGINT: 'int8', VARCHAR: 'varchar', CHARACTER: 'varchar', TEXT: 'text',
  BOOLEAN: 'bool', BOOL: 'bool', TIMESTAMP: 'timestamp', DATE: 'date',
  JSONB: 'jsonb', JSON: 'json', NUMERIC: 'numeric', DECIMAL: 'numeric',
  'DOUBLE PRECISION': 'float8', REAL: 'float4', UUID: 'uuid'
};

function parseColumns(body) {
  const cols = {};
  for (let def of splitTopLevel(body)) {
    if (/^(UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|CHECK)\b/i.test(def)) continue;
    const m = def.match(/^([A-Za-z_]\w*)\s+([\s\S]+)$/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const rest = m[2];
    const baseMatch = rest.match(/^([A-Za-z_]\w*)/i);
    let base = baseMatch ? baseMatch[1].toUpperCase() : 'TEXT';
    if (base === 'DOUBLE' && /^\s*PRECISION\b/i.test(rest.slice(baseMatch[0].length))) {
      base = 'DOUBLE PRECISION';
    }
    let type = TYPE_MAP[base] || base.toLowerCase();

    if (/^\s*\[\s*\]/.test(rest.slice(baseMatch ? baseMatch[0].length : 0))) type += '[]';
    const lenM = rest.match(/\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/i);

    cols[name] = {
      type,
      length: base === 'VARCHAR' && lenM ? parseInt(lenM[1], 10) : null,
      precision: /^(NUMERIC|DECIMAL)$/.test(base) && lenM ? parseInt(lenM[1], 10) : null,
      scale:     /^(NUMERIC|DECIMAL)$/.test(base) && lenM && lenM[2] ? parseInt(lenM[2], 10) : null,
      notNull: /\bNOT\s+NULL\b/i.test(rest),
      pk: /\bPRIMARY\s+KEY\b/i.test(rest),
      serial: /^SERIAL$/i.test(base),
      hasDefault: /\bDEFAULT\b/i.test(rest),
      raw: def.replace(/\s+/g, ' ')
    };
  }
  return cols;
}

function parseSchemaSql(sql) {
  const tables = {};
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)\s*\(([\s\S]*?)\r?\n\s*\);/gi;
  let m;
  while ((m = tableRe.exec(sql)) !== null) {
    tables[m[1].toLowerCase()] = parseColumns(m[2]);
  }
  const indexes = [];
  const idxRe = /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_]\w*)\s+ON\s+([A-Za-z_]\w*)/gi;
  while ((m = idxRe.exec(sql)) !== null) {
    indexes.push({ name: m[1].toLowerCase(), table: m[2].toLowerCase() });
  }
  return { tables, indexes };
}

export function loadExpectedSchema(schemaPath) {
  return parseSchemaSql(fs.readFileSync(schemaPath, 'utf8'));
}
// ------------------------------------------------- comparaison avec la base --

function normalizeActual(col) {
  let type = col.data_type === 'ARRAY'
    ? (col.udt_name || '').replace(/^_/, '') + '[]'
    : col.udt_name;
  return {
    type,
    length: col.character_maximum_length,
    precision: col.numeric_precision,
    scale: col.numeric_scale,
    nullable: col.is_nullable === 'YES',
    hasDefault: col.column_default !== null
  };
}

function describeExpected(e) {
  const bits = [e.raw];
  if (e.pk) bits.push('(PK)');
  return bits.join(' ');
}

function describeActual(a) {
  const len = a.length ? `(${a.length})` : '';
  const prec = a.precision ? `(${a.precision},${a.scale ?? 0})` : '';
  return `${a.type}${a.type === 'varchar' ? len : ''}${a.type === 'numeric' ? prec : ''} ${a.nullable ? 'NULL' : 'NOT NULL'}`;
}

let issues = 0;

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(here, '..', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('schema.sql introuvable :', schemaPath);
    process.exit(2);
  }
  const { tables: expected, indexes: expectedIdx } = loadExpectedSchema(schemaPath);

  const { rows: cols } = await pool.query(`
    SELECT table_name, column_name, data_type, udt_name,
           character_maximum_length, numeric_precision, numeric_scale,
           is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const actual = {};
  for (const c of cols) {
    (actual[c.table_name] ||= {})[c.column_name] = normalizeActual(c);
  }

  const { rows: pkRows } = await pool.query(`
    SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
  `);
  const pks = {};
  for (const r of pkRows) (pks[r.table_name] ||= new Set()).add(r.column_name);

  const { rows: idxRows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
  );
  const dbIndexes = new Set(idxRows.map(r => r.indexname));

  // ------------------------------- rapport ---------------------------------
  console.log('Verification de la structure (schema.sql vs base reelle)\n');
  const suggestions = [];

  for (const [table, expCols] of Object.entries(expected)) {
    if (!actual[table]) {
      issues++;
      console.log(`[TABLE MANQUANTE] ${table}`);
      for (const def of Object.values(expCols)) {
        suggestions.push(`ALTER TABLE ${table} ADD COLUMN ${def.raw};`);
      }
      continue;
    }

    const actCols = actual[table];
    const problems = [];

    for (const [col, exp] of Object.entries(expCols)) {
      const act = actCols[col];
      if (!act) {
        issues++;
        problems.push(`  colonne manquante : ${col} (attendu: ${describeExpected(exp)})`);
        suggestions.push(`ALTER TABLE ${table} ADD COLUMN ${exp.raw};`);
        continue;
      }
      if (act.type !== exp.type) {
        issues++;
        problems.push(`  type de ${col} : attendu ${exp.type}, reel ${act.type}`);
        continue;
      }
      if (exp.length && act.length && act.length !== exp.length) {
        issues++;
        problems.push(`  longueur de ${col} : attendu ${exp.length}, reel ${act.length}`);
      }
      if (exp.precision && act.precision && act.precision !== exp.precision) {
        issues++;
        problems.push(`  precision de ${col} : attendu ${exp.precision},${exp.scale ?? 0}, reel ${act.precision},${act.scale ?? 0}`);
      }
      if ((exp.notNull || exp.pk) && act.nullable && !act.hasDefault) {
        issues++;
        problems.push(`  ${col} devrait etre NOT NULL (actuellement nullable sans defaut)`);
        suggestions.push(`ALTER TABLE ${table} ALTER COLUMN ${col} SET NOT NULL;`);
      }
      if (exp.pk && !(pks[table]?.has(col))) {
        issues++;
        problems.push(`  cle primaire manquante sur ${table}.${col}`);
      }
    }

    for (const col of Object.keys(actCols)) {
      if (!expCols[col]) {
        problems.push(`  colonne en trop : ${col} (${describeActual(actCols[col])}) - volontaire ?`);
      }
    }

    if (problems.length) {
      console.log(`[ECARTS] ${table}`);
      problems.forEach(p => console.log(p));
    } else {
      console.log(`[OK] ${table} (${Object.keys(expCols).length} colonnes conformes)`);
    }
  }

  for (const t of Object.keys(actual).sort()) {
    if (!expected[t]) console.log(`[INFO] table hors schema.sql : ${t}`);
  }

  console.log('\nIndex :');
  for (const idx of expectedIdx) {
    if (dbIndexes.has(idx.name)) console.log(`  [OK] ${idx.name}`);
    else {
      issues++;
      console.log(`  [MANQUANT] ${idx.name} sur ${idx.table}`);
      suggestions.push('-- Recreez l\'index via npm run db:init (CREATE INDEX IF NOT EXISTS).');
    }
  }

  await pool.end();

  if (suggestions.length) {
    console.log('\nSuggestions de correction (non executees) :');
    suggestions.forEach(s => console.log('  ' + s));
  }

  console.log(`\nRESULTAT : ${issues === 0 ? 'structure conforme' : issues + ' ecart(s) detecte(s)'}`);
  process.exit(issues === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('Erreur de connexion - verifier DATABASE_URL :', e.message);
  process.exit(2);
});