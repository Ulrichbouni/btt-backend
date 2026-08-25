import pool from '../db.js';

/**
 * Diagnostic en lecture seule de la base de donnees.
 *   npm run db:check
 *
 * Verifie :
 *   - les tables attendues par schema.sql (presentes / manquantes)
 *   - l'etat de la colonne de la table paiements (payment_data vs notchpay_data)
 *   - la presence d'au moins un admin
 *
 * Aucune ecriture. Exit 1 si action requise, 0 si tout est conforme.
 */

const EXPECTED_TABLES = [
  'utilisateurs', 'otp_secrets', 'produits', 'devis',
  'missions_technicien', 'chantiers', 'mesures_terrain', 'paiements',
  'calculs_historique', 'professionnels', 'notifications'
];

let actionsRequired = false;

async function main() {
  console.log('Diagnostic base de donnees (lecture seule)\n');

  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const present = new Set(rows.map(r => r.table_name));

  const existing = EXPECTED_TABLES.filter(t => present.has(t));
  const missing  = EXPECTED_TABLES.filter(t => !present.has(t));

  console.log(`Tables : ${existing.length}/${EXPECTED_TABLES.length} presentes`);
  if (missing.length) {
    actionsRequired = true;
    console.log(`  MANQUANTES : ${missing.join(', ')}`);
    console.log('  -> Appliquer le schema : npm run db:init');
    console.log('     (idempotent : CREATE TABLE IF NOT EXISTS, sans risque pour l\'existant)');
  }

  if (present.has('paiements')) {
    const { rows: cols } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'paiements'`
    );
    const names = cols.map(c => c.column_name);
    if (names.includes('notchpay_data')) {
      actionsRequired = true;
      console.log('\nTable paiements : colonne legacy "notchpay_data" detectee');
      console.log('  -> ALTER TABLE paiements RENAME COLUMN notchpay_data TO payment_data;');
    } else if (names.includes('payment_data')) {
      console.log('Table paiements : colonne "payment_data" conforme');
    }
  }

  if (present.has('utilisateurs')) {
    const { rows: admins } = await pool.query(`SELECT COUNT(*)::int AS n FROM utilisateurs WHERE role = 'admin'`);
    const n = admins[0]?.n ?? 0;
    if (n === 0) {
      actionsRequired = true;
      console.log('\nAucun admin en base');
      console.log('  -> npm run db:seed  (avec ADMIN_EMAIL + ADMIN_PASSWORD >= 12 caracteres)');
    } else {
      console.log(`Admin(s) en base : ${n}`);
    }
  }

  await pool.end();

  console.log('');
  if (actionsRequired) {
    console.log('RESULTAT : actions requises (voir ci-dessus).');
    process.exit(1);
  }
  console.log('RESULTAT : base conforme.');
  process.exit(0);
}

main().catch(e => {
  console.error('Erreur de connexion — verifier DATABASE_URL :', e.message);
  process.exit(2);
});