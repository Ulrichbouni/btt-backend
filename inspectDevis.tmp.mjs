import pool from './db.js';
async function main(){
  for(const t of ['devis','paiements','chantiers','missions_technicien']){
    const r = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position`,[t]);
    console.log('TABLE '+t+': '+r.rows.map(x=>x.column_name+':'+x.data_type).join(', '));
  }
  await pool.end();
}
main();
