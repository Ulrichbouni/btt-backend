/**
 * checkDb.js — Vérifie la connexion et l'état de la base BTT-LUX.
 * Liste les tables attendues et leur nombre de lignes.
 *
 * Utilisation :  node checkDb.js
 */
import pool from './db.js';

const EXPECTED_TABLES = [
  'utilisateurs',
  'produits',
  'devis',
  'chantiers',
  'missions_technicien',
  'mesures_terrain',
  'otp_secrets',
  'calculs_historique',
  'accessoires',
  'paiements',
  'professionnels',
  'notifications',
];

async function main() {
  try {
    const probe = await pool.query('SELECT 1');
    console.log('✅ Connexion base OK (SELECT 1)');

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const existing = new Set(rows.map((r) => r.table_name));

    console.log('\n📋 Tables :');
    let missing = 0;
    for (const t of EXPECTED_TABLES) {
      if (existing.has(t)) {
        const count = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
        console.log(`   ✅ ${t}  (${count.rows[0].n} lignes)`);
      } else {
        console.log(`   ❌ ${t}  (MANQUANTE)`);
        missing++;
      }
    }

    if (missing > 0) {
      console.log(`\n⚠️ ${missing} table(s) manquante(s). Lancez : node initDb.js`);
      process.exitCode = 1;
    } else {
      console.log('\n✅ Toutes les tables sont présentes.');
    }
  } catch (err) {
    console.error('❌ Erreur de connexion ou de vérification :', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();