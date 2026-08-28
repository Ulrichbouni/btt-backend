/**
 * seed.js — Remplit la base BTT-LUX avec les données de départ :
 *   - Utilisateur admin (ADMIN_EMAIL / ADMIN_PASSWORD, min 12 caractères)
 *   - Produits Luxerboard
 *   - Professionnels BTP
 *
 * Sécurisé : refuse de créer un admin si ADMIN_PASSWORD est absent ou < 12 caractères.
 * Idempotent : ON CONFLICT DO NOTHING.
 *
 * Utilisation :  node seed.js
 */
import bcrypt from 'bcrypt';
import pool from './db.js';

const products = [
  {
    nom: 'Panneau Luxerboard 6mm', epaisseur: '6mm', categorie: 'Cloison',
    prix_ttc: 8000, poids_unite: 8.5, qte_conteneur: 400, statut_stock: 'En stock',
    application: 'Cloisons intérieures légères',
  },
  {
    nom: 'Panneau Luxerboard 8mm', epaisseur: '8mm', categorie: 'Cloison',
    prix_ttc: 9500, poids_unite: 11.2, qte_conteneur: 320, statut_stock: 'En stock',
    application: 'Cloisons et habillages',
  },
  {
    nom: 'Panneau Luxerboard 10mm', epaisseur: '10mm', categorie: 'Cloison',
    prix_ttc: 11500, poids_unite: 13.8, qte_conteneur: 250, statut_stock: 'En stock',
    application: 'Cloisons, faux plafonds',
  },
  {
    nom: 'Panneau Luxerboard 12mm', epaisseur: '12mm', categorie: 'Panneau',
    prix_ttc: 13500, poids_unite: 16.5, qte_conteneur: 200, statut_stock: 'En stock',
    application: 'Panneaux muraux, bardage intérieur',
  },
  {
    nom: 'Panneau Luxerboard 14mm', epaisseur: '14mm', categorie: 'Panneau',
    prix_ttc: 15500, poids_unite: 19.2, qte_conteneur: 160, statut_stock: 'Sur commande',
    application: 'Bardage extérieur, plans de travail',
  },
];

const professionnels = [
  { nom: 'Ets Takam Construction', role: 'Maçon', ville: 'Douala', telephone: '+237677111222', niveau_certification: 'Niveau 3', note: 4.5, nb_chantiers: 120 },
  { nom: 'BTP Excellence', role: 'Faux plafonniste', ville: 'Yaoundé', telephone: '+237699333444', niveau_certification: 'Niveau 2', note: 4.2, nb_chantiers: 85 },
  { nom: 'Constructions Moderne', role: 'Menuisier', ville: 'Bafoussam', telephone: '+237655555666', niveau_certification: 'Niveau 3', note: 4.8, nb_chantiers: 210 },
  { nom: 'Sarl BatiPlus', role: 'Électricien', ville: 'Douala', telephone: '+237670777888', niveau_certification: 'Niveau 1', note: 3.9, nb_chantiers: 45 },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@btt-lux.com';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 12) {
    console.error('❌ ADMIN_PASSWORD requis (min 12 caractères). Seed interrompu.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Admin
    const hash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO utilisateurs (nom, email, telephone, role, mot_de_passe_hash)
       VALUES ($1,$2,$3,'admin',$4)
       ON CONFLICT (email) DO NOTHING`,
      ['Administrateur BTT-LUX', adminEmail, '+237600000000', hash]
    );
    console.log(`✅ Admin OK (${adminEmail})`);

    // 2. Produits
    for (const p of products) {
      await client.query(
        `INSERT INTO produits (nom, epaisseur, categorie, prix_ttc, poids_unite, qte_conteneur, statut_stock, application)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [p.nom, p.epaisseur, p.categorie, p.prix_ttc, p.poids_unite, p.qte_conteneur, p.statut_stock, p.application]
      );
    }
    console.log(`✅ ${products.length} produits OK`);

    // 3. Professionnels
    for (const pr of professionnels) {
      await client.query(
        `INSERT INTO professionnels (nom, role, ville, telephone, niveau_certification, note, nb_chantiers)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (nom, ville, telephone, role) DO NOTHING`,
        [pr.nom, pr.role, pr.ville, pr.telephone, pr.niveau_certification, pr.note, pr.nb_chantiers]
      );
    }
    console.log(`✅ ${professionnels.length} professionnels OK`);

    await client.query('COMMIT');
    console.log('🎉 Seed terminé avec succès.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur seed :', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();