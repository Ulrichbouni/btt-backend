/**
 * cleanupTestData.js — Supprime les comptes de test créés lors des audits.
 * Utile pour garder la base de production propre.
 * Utilisation :  node cleanupTestData.js
 */
import pool from './db.js';

async function main() {
  try {
    const r = await pool.query(
      `DELETE FROM utilisateurs WHERE email LIKE 'audit%@test.com' RETURNING id, email`
    );
    console.log(`✅ ${r.rowCount} utilisateur(s) de test supprimé(s).`);
  } catch (err) {
    console.error('Erreur :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();