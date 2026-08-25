import express from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { validate, paiementSchema } from "../middleware/validation.js";
import CampayService from "../services/campay.js";
import WhatsAppService from "../services/whatsapp.js";

const router = express.Router();
const campay = new CampayService();

router.post("/initier", verifyToken, validate(paiementSchema), async (req, res) => {
  const { devis_id, montant, methode, telephone, customer_name, customer_email } = req.body;
  try {
    const reference = `BTT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const redirectUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/paiement?ref=${reference}` : undefined;

    const result = await campay.initPayment({
      amount: montant,
      currency: "XAF",
      description: devis_id ? `Devis #${devis_id}` : "Paiement BTT-LUX",
      externalReference: reference,
      phone: telephone,
      redirectUrl
    });

    await pool.query(
      `INSERT INTO paiements (utilisateur_id, devis_id, methode, montant, reference, statut, payment_data) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.user.id, devis_id || null, methode || "mobile_money", montant, reference, "en_attente", JSON.stringify(result)]
    );

    const user = await pool.query("SELECT telephone FROM utilisateurs WHERE id=$1", [req.user.id]);
    const phone = user.rows[0]?.telephone || telephone;
    WhatsAppService.sendPaymentConfirmation(phone, reference, montant, "en_attente");

    res.json({ success: true, reference, ...result });
  } catch (err) {
    console.error("Erreur Campay:", err);
    res.status(400).json({ error: err.message || "Erreur Campay" });
  }
});

router.post("/webhook", async (req, res) => {
  try {
    const raw = JSON.stringify(req.body);
    const receivedKey = req.headers["x-campay-key"] || req.query.key;
    const expected = process.env.CAMPAY_WEBHOOK_KEY;
    if (expected && receivedKey !== expected) {
      return res.status(401).json({ error: "Invalid webhook key" });
    }

    const reference = req.body?.reference || req.body?.external_reference || req.query.reference;
    const status = req.body?.status || req.query.status;
    const transactionId = req.body?.transaction || req.body?.id;
    const metadata = req.body?.metadata || {};

    if (!reference) return res.status(400).json({ error: "Missing reference" });

    const statutMap = { success: "reussi", failed: "echoue", pending: "en_attente" };
    const newStatus = statutMap[status] || status || "en_attente";

    await pool.query(`UPDATE paiements SET statut = $1, transaction_id = $2, updated_at = NOW() WHERE reference = $3`, [newStatus, transactionId, reference]);

    if (newStatus === "reussi" && metadata?.devis_id) {
      await pool.query(`UPDATE devis SET statut = 'paye' WHERE id = $1`, [metadata.devis_id]);
      const devis = await pool.query("SELECT utilisateur_id FROM devis WHERE id=$1", [metadata.devis_id]);
      if (devis.rows.length) {
        const client = await pool.query("SELECT telephone FROM utilisateurs WHERE id=$1", [devis.rows[0].utilisateur_id]);
        const phone = client.rows[0]?.telephone;
        const p = await pool.query("SELECT montant FROM paiements WHERE reference=$1", [reference]);
        if (phone) WhatsAppService.sendPaymentConfirmation(phone, reference, p.rows[0]?.montant, "reussi");
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Erreur webhook Campay:", err);
    res.status(500).json({ error: "Erreur webhook" });
  }
});

router.get("/verifier/:reference", verifyToken, async (req, res) => {
  try {
    const { reference } = req.params;
    const payment = await pool.query("SELECT * FROM paiements WHERE reference = $1", [reference]);
    if (!payment.rows.length) return res.status(404).json({ error: "Paiement non trouve" });
    if (payment.rows[0].utilisateur_id !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Acces refuse" });
    }
    const result = await campay.verifyPayment(reference);
    res.json(result);
  } catch (err) {
    console.error("Erreur verification Campay:", err);
    res.status(400).json({ error: err.message || "Erreur lors de la verification" });
  }
});

router.get("/historique", verifyToken, async (req, res) => {
  const result = await pool.query(`SELECT * FROM paiements WHERE utilisateur_id = $1 ORDER BY created_at DESC`, [req.user.id]);
  res.json(result.rows);
});

router.get("/admin/tous", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin requis" });
  const result = await pool.query(
    `SELECT p.*, u.nom as utilisateur_nom FROM paiements p JOIN utilisateurs u ON p.utilisateur_id = u.id ORDER BY p.created_at DESC`
  );
  res.json(result.rows);
});

export default router;

