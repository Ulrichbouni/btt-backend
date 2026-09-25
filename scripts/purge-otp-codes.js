import pool from "../db.js";

try {
  const result = await pool.query(
    "DELETE FROM email_otp_codes WHERE expires_at < now()",
  );

  console.log(
    `✅ ${result.rowCount ?? 0} code(s) OTP expiré(s) purgé(s).`,
  );
} catch (error) {
  console.error("❌ Purge OTP impossible :", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
