import pool from './db.js';
import bcrypt from 'bcrypt';

async function main() {
  const hash = await bcrypt.hash('admin123456789', 10);
  console.log('Nouveau hash:', hash);
  
  await pool.query(
    `UPDATE utilisateurs SET mot_de_passe_hash = $1 WHERE email = 'admin@btt-lux.com'`,
    [hash]
  );
  console.log('✅ Mot de passe mis à jour');
  
  // Vérification
  const res = await pool.query(`SELECT id, email, mot_de_passe_hash FROM utilisateurs WHERE email = 'admin@btt-lux.com'`);
  const user = res.rows[0];
  const match = await bcrypt.compare('admin123456789', user.mot_de_passe_hash);
  console.log('Vérification match:', match);
  
  pool.end();
}

main().catch(console.error);