/**
 * resetAdmin.mjs — Reset mot de passe admin via acces DB direct.
 * Usage securise (ne pas passer le mdp en argument visible) :
 *   $env:ADMIN_EMAIL="admin@btt-lux.com"
 *   $env:NEW_ADMIN_PASSWORD="...12 caracteres min, que vous seul connaissez..."
 *   node resetAdmin.mjs
 *   Remove-Item Env:\NEW_ADMIN_PASSWORD
 * Ne loggue JAMAIS le mot de passe ni le hash.
 */
import bcrypt from "bcrypt";
import pool from "./db.js";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@btt-lux.com";
  const pwd = process.env.NEW_ADMIN_PASSWORD;

  if (!pwd || pwd.length < 12) {
    console.error("❌ NEW_ADMIN_PASSWORD requis (min 12 caracteres).");
    console.error('   Ex: $env:NEW_ADMIN_PASSWORD="Votre-Nouveau-Mdp-123!"');
    process.exitCode = 1;
    await pool.end();
    return;
  }
  try {
    const hash = await bcrypt.hash(pwd, 10);
    const r = await pool.query(
      "UPDATE utilisateurs SET mot_de_passe_hash=$1 WHERE email=$2 AND role=$3 RETURNING id, nom, email, role",
      [hash, email, "admin"],
    );
    if (!r.rows.length) {
      console.error(
        `❌ Aucun admin trouve avec email=${email}. Verifiez ADMIN_EMAIL.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        `✅ Mot de passe mis a jour pour ${r.rows[0].email} (${r.rows[0].nom})`,
      );
      console.log("👉 Testez : POST /api/auth/login {email, mot_de_passe}");
      console.log("🧹 Pensez a : Remove-Item Env:\\NEW_ADMIN_PASSWORD");
    }
  } catch (e) {
    console.error("❌ Erreur reset : " + e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
main();
