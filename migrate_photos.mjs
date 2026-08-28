import pool from './db.js';

async function main() {
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='devis' ORDER BY ordinal_position"
  );
  console.log('Colonnes devis:', cols.rows.map(r => r.column_name).join(', '));

  const hasPhotos = cols.rows.some(r => r.column_name === 'photos');
  if (!hasPhotos) {
    await pool.query("ALTER TABLE devis ADD COLUMN photos JSONB DEFAULT '[]'");
    console.log('Colonne photos (JSONB) ajoutée à devis.');
  } else {
    console.log('Colonne photos déjà présente.');
  }

  const hasDate = cols.rows.some(r => r.column_name === 'date_souhaitee');
  if (!hasDate) {
    await pool.query('ALTER TABLE devis ADD COLUMN date_souhaitee DATE');
    console.log('Colonne date_souhaitee (DATE) ajoutée à devis.');
  } else {
    console.log('Colonne date_souhaitee déjà présente.');
  }
  process.exit(0);
}

main().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });