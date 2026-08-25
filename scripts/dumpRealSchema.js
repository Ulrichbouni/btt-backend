import pool from '../db.js';

/**
 * One-shot : genere le DDL fidele de la base REELLE (lecture seule).
 *   node scripts/dumpRealSchema.js > real-schema.sql
 *
 * Sert a re-aligner schema.sql sur la production (UUID, types reels).
 */

const TYPE_MAP = {
  int2: 'SMALLINT', int4: 'INTEGER', int8: 'BIGINT',
  varchar: 'VARCHAR', bpchar: 'CHAR', text: 'TEXT',
  bool: 'BOOLEAN', timestamp: 'TIMESTAMP', date: 'DATE', time: 'TIME',
  jsonb: 'JSONB', json: 'JSON', numeric: 'NUMERIC',
  float8: 'DOUBLE PRECISION', float4: 'REAL', uuid: 'UUID'
};

function colType(c) {
  if (c.data_type === 'ARRAY') {
    const el = (c.udt_name || '').replace(/^_/, '');
    return `${TYPE_MAP[el] || el.toUpperCase()}[]`;
  }
  let t = TYPE_MAP[c.udt_name] || c.udt_name.toUpperCase();
  if (c.udt_name === 'varchar' && c.character_maximum_length) t += `(${c.character_maximum_length})`;
  if (c.udt_name === 'numeric' && c.numeric_precision) {
    t += `(${c.numeric_precision},${c.numeric_scale ?? 0})`;
  }
  return t;
}

const { rows: tables } = await pool.query(`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ORDER BY table_name
`);

const { rows: allCols } = await pool.query(`
  SELECT table_name, column_name, data_type, udt_name,
         character_maximum_length, numeric_precision, numeric_scale,
         is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);

const { rows: cons } = await pool.query(`
  SELECT conrelid::regclass::text AS tbl, conname, contype,
         pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND contype IN ('p','f','u','c')
  ORDER BY conrelid::regclass::text, conname
`);

const { rows: idx } = await pool.query(`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes WHERE schemaname = 'public'
  ORDER BY tablename, indexname
`);

const out = [];
out.push('-- Genere depuis la base REELLE (node scripts/dumpRealSchema.js)');
out.push('-- Source de verite : structure de production.');
out.push('');

for (const t of tables) {
  const name = t.table_name;
  const cols = allCols.filter(c => c.table_name === name);
  if (!cols.length) continue;
  out.push(`CREATE TABLE IF NOT EXISTS ${name} (`);
  const lines = cols.map(c => {
    let line = `    ${c.column_name} ${colType(c)}`;
    if (c.is_nullable === 'NO') line += ' NOT NULL';
    if (c.column_default !== null && !/^nextval\(/i.test(c.column_default)) {
      line += ` DEFAULT ${c.column_default}`;
    }
    return line;
  });
  for (const cn of cons.filter(k => k.tbl === name)) {
    const def = cn.def.replace(/^CHECK\s*(\(\(?.*\)?\))$/i, 'CHECK $1');
    lines.push(`    CONSTRAINT ${cn.conname} ${cn.contype === 'p' ? def.replace(/^PRIMARY KEY/i, 'PRIMARY KEY') : def}`);
  }
  out.push(lines.join(',\n'));
  out.push(');');
  out.push('');
}

out.push('-- Index');
for (const i of idx) {
  if (/^_pkey$|_pkey$/i.test(i.indexname)) continue;
  if (/^\w+_pkey$/.test(i.indexname)) continue;
  if (i.indexdef.includes('UNIQUE') && /_pkey|_key\b/.test(i.indexname)) continue;
  out.push(i.indexdef.replace(/^CREATE\s+(UNIQUE\s+)?INDEX\s+\S+\s+ON/i, 'CREATE INDEX IF NOT EXISTS ' + i.indexname + ' ON'));
}
out.push('');

console.log(out.join('\n'));
await pool.end();