import pool from '../db.js';
import fs from 'fs';
import path from 'path';

const schemaPath = path.join(process.cwd(), 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

async function init() {
  try {
    await pool.query(sql);
    console.log('Base initialisée');
    process.exit(0);
  } catch (e) {
    console.error('Erreur init DB', e);
    process.exit(1);
  }
}

init();
