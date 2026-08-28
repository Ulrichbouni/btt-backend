/**
 * inspectColumns.js — Affiche les colonnes d'une table de la base.
 * Utilisation :  node inspectColumns.js <nom_table>   (ex: utilisateurs)
 */
import pool from './db.js';

const table = process.argv[2] || 'utilisateurs';

async function main() {
  try {
    const r = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    if (!r.rows.length) {
      console.log(`Table "${table}" introuvable ou vide.`);
      return;
    }
    for (const c of r.rows) {
      console.log(`   ${c.column_name.padEnd(28)} ${c.data_type.padEnd(20)} nullable=${c.is_nullable}`);
    }
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();