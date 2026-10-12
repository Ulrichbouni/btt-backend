/**
 * revoke-sessions.mjs — Révoque les sessions (JWT) d'un utilisateur en
 * incrémentant `auth_version`. Le middleware `verifyToken` rejette ensuite
 * tout jeton dont le claim `auth_version` ne correspond plus à la valeur en
 * base : les anciens tokens sont invalidés SANS redéployer l'application et
 * SANS déconnecter les autres utilisateurs.
 *
 * Contrairement à la rotation du `JWT_SECRET` (globale, coupe tout le monde),
 * cette révocation est chirurgicale : elle ne cible qu'un seul compte.
 *
 * ── Base de données visée ────────────────────────────────────────────────
 * Le script utilise `DATABASE_URL` (déjà chargé par ./db.js). Pour révoquer
 * un jeton FUITÉ EN PRODUCTION, il faut impérativement pointer sur la base de
 * PRODUCTION, sinon on ne révoque rien côté Render :
 *
 *   PowerShell :
 *     $env:ADMIN_EMAIL="admin@btt-lux.com"
 *     $env:DATABASE_URL="<Internal/External Database URL de Render>"
 *     node revoke-sessions.mjs
 *     Remove-Item Env:\ADMIN_EMAIL
 *
 *   bash :
 *     ADMIN_EMAIL="admin@btt-lux.com" \
 *     DATABASE_URL="<url prod>" node revoke-sessions.mjs
 *
 * Par défaut (sans DATABASE_URL réécrit), le script vise la base du .env
 * local — pratique pour un test, inefficace contre un jeton de production.
 *
 * Ne loggue jamais de secret. Affiche uniquement l'e-mail, l'id et la version.
 */
import pool from "./db.js";

async function main() {
  const email = process.env.ADMIN_EMAIL || "admin@btt-lux.com";

  // Filet de sécurité : rappeler explicitement la base visée avant d'écrire.
  const host = (() => {
    try {
      const raw = String(process.env.DATABASE_URL || "");
      return new URL(raw.replace(/^postgres(ql)?:/, "http:")).hostname;
    } catch {
      return "(DATABASE_URL illisible)";
    }
  })();
  console.log(`🎯 Base visée : ${host}`);
  console.log(`👤 Compte    : ${email}`);
  console.log("   → Vérifiez que cet hôte est bien la base de PRODUCTION avant de continuer.\n");

  try {
    // Incrémente auth_version de façon atomique ; renvoie la nouvelle valeur.
    const r = await pool.query(
      `UPDATE utilisateurs
          SET auth_version = COALESCE(auth_version, 0) + 1
        WHERE email = $1
        RETURNING id, email, role, auth_version`,
      [email],
    );

    if (!r.rows.length) {
      console.error(`❌ Aucun utilisateur trouvé avec email=${email}. Vérifiez ADMIN_EMAIL.`);
      process.exitCode = 1;
    } else {
      const u = r.rows[0];
      console.log(`✅ Sessions révoquées pour ${u.email} (${u.role}, id=${u.id}).`);
      console.log(`   Nouvelle auth_version = ${u.auth_version}.`);
      console.log("   Tous les JWT émis avant cette bascule sont désormais rejetés (401).");
      console.log("👉 Reconnectez-vous : l'app obtiendra un nouveau token avec la version à jour.");
      console.log("🧹 Pensez à : Remove-Item Env:\\ADMIN_EMAIL  (et DATABASE_URL si réécrit)");
    }
  } catch (e) {
    console.error("❌ Erreur révocation : " + e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
