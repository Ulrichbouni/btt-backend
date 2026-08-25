import bcrypt from 'bcrypt';
import pool from '../db.js';

/**
 * Script de seed — à exécuter UNE SEULE FOIS (ou de façon idempotente).
 *   npm run db:seed
 *
 * Variables d'environnement attendues :
 *   ADMIN_EMAIL     (defaut: admin@btt-lux.com)
 *   ADMIN_PASSWORD  (defaut: aucune -> interdit)
 */
async function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@btt-lux.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 12) {
    console.error('❌ ADMIN_PASSWORD est requis (minimum 12 caractères).');
    console.error('   Ex: $env:ADMIN_PASSWORD="UnMotDePasseFort123!" ; npm run db:seed');
    process.exit(1);
  }

  // 1) Admin initial
  const hash = await bcrypt.hash(adminPassword, 12);
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, telephone, mot_de_passe_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    ['Admin BTT-LUX', adminEmail, '+237670000000', hash]
  );
  console.log(`✅ Admin prêt (${adminEmail})`);

  // 2) Seed produits de démonstration
  await pool.query(
    `INSERT INTO produits (nom, nom_en, epaisseur, categorie, application, prix_ttc, poids_unite, qte_conteneur, statut_stock) VALUES
       ('Luxerboard Standard', 'Luxerboard Standard', '10mm', 'Plafonds', 'Plafonds résidentiels et commerciaux', 8500, 8.5, 200, 'En stock'),
       ('Luxerboard Premium', 'Luxerboard Premium', '12mm', 'Façades', 'Façades et bardages', 12500, 10.2, 150, 'En stock'),
       ('Luxerboard Industriel', 'Luxerboard Industriel', '14mm', 'Industriel', 'Isolation industrielle', 15800, 12.0, 120, 'En stock'),
       ('Luxerboard Acoustique', 'Luxerboard Acoustique', '10mm', 'Cloisons', 'Cloisons phoniques', 9800, 9.0, 180, 'En stock'),
       ('Accessoires de fixation', 'Fixation Accessories', '-', 'Accessoires', 'Vis, rondelles, supports', 500, 0.1, 1000, 'En stock')
     ON CONFLICT DO NOTHING`
  );
  console.log('✅ Produits de démonstration insérés');

  await pool.end();
  process.exit(0);
}

seed().catch((e) => {
  console.error('❌ Erreur seed:', e);
  process.exit(1);
});