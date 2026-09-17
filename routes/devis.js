import express from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/auth.js";
import { validate, devisSchema } from "../middleware/validation.js";
import WhatsAppService from "../services/whatsapp.js";
import EmailService from "../services/email.js";
const router = express.Router();

// Créer une demande de devis
// IMPORTANT (sécurité) : nb_panneaux / prix_unitaire / cout_estime_brut / total_final
// ne sont JAMAIS acceptés depuis le client. Ils sont soit calculés ici à partir
// du produit choisi, soit laissés à null pour ajustement manuel par l'admin
// (voir PUT /api/devis/:id ci-dessous).
router.post("/", verifyToken, validate(devisSchema), async (req, res) => {
  const { surface, ville, adresse, date_souhaitee, photos, produit_id } =
    req.body;

  let nb_panneaux = null;
  let prix_unitaire = null;
  let cout_estime_brut = null;

  if (produit_id) {
    const produit = await pool.query(
      "SELECT prix_ttc FROM produits WHERE id = $1",
      [produit_id],
    );
    if (!produit.rows.length)
      return res.status(404).json({ error: "Produit non trouvé" });
    const surface_panneau = 1.2; // m² standard, cohérent avec le calculateur
    nb_panneaux = Math.ceil((surface / surface_panneau) * 1.1); // marge 10%
    prix_unitaire = produit.rows[0].prix_ttc;
    cout_estime_brut = Math.round(nb_panneaux * prix_unitaire);
  }

  const result = await pool.query(
    `INSERT INTO devis (utilisateur_id, surface, ville, adresse, date_souhaitee, photos, nb_panneaux, prix_unitaire, cout_estime_brut, total_final, produit_id, statut) 
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'envoye') RETURNING *`,
    [
      req.user.id,
      surface,
      ville,
      adresse,
      date_souhaitee || null,
      Array.isArray(photos) ? photos : [],
      nb_panneaux,
      prix_unitaire,
      cout_estime_brut,
      null, // total_final : toujours fixé par l'admin après revue
      produit_id || null,
    ],
  );

  // Notifications
  const client = await pool.query(
    "SELECT telephone, email, nom FROM utilisateurs WHERE id=$1",
    [req.user.id],
  );
  const phone = client.rows[0]?.telephone;
  const email = client.rows[0]?.email;
  const montant = cout_estime_brut || 0;

  // WhatsApp notification
  if (phone) {
    WhatsAppService.sendDevisNotification(phone, result.rows[0].id, montant);
  }

  // Email notification
  if (email) {
    await EmailService.sendDevisConfirmation(
      email,
      client.rows[0].nom,
      result.rows[0].id,
      montant,
    );
  }

  res.status(201).json(result.rows[0]);
});

// Mes devis (client)
router.get("/mes-devis", verifyToken, async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM devis WHERE utilisateur_id = $1 ORDER BY created_at DESC`,
    [req.user.id],
  );
  res.json(result.rows);
});

// Détail d'un devis (client ou admin)
router.get("/:id", verifyToken, async (req, res) => {
  const result = await pool.query("SELECT * FROM devis WHERE id = $1", [
    req.params.id,
  ]);
  if (!result.rows.length)
    return res.status(404).json({ error: "Devis non trouvé" });
  if (
    result.rows[0].utilisateur_id !== req.user.id &&
    req.user.role !== "admin"
  ) {
    return res.status(403).json({ error: "Accès refusé" });
  }
  res.json(result.rows[0]);
});

// Admin: Tous les devis
router.get("/admin/tous", verifyToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin requis" });
  const result = await pool.query(
    `SELECT d.*, u.nom as client_nom, u.email as client_email 
     FROM devis d 
     JOIN utilisateurs u ON d.utilisateur_id = u.id 
     ORDER BY d.created_at DESC`,
  );
  res.json(result.rows);
});

// Admin : Ajuster le prix final d'un devis (remise, frais de transport, frais divers)
router.put("/:id", verifyToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin requis" });
  const { id } = req.params;
  const { remise_pourcentage, frais_transport, frais_divers } = req.body;
  const devis = await pool.query(
    "SELECT cout_estime_brut FROM devis WHERE id = $1",
    [id],
  );
  if (!devis.rows.length)
    return res.status(404).json({ error: "Devis non trouvé" });
  if (devis.rows[0].cout_estime_brut === null) {
    return res.status(400).json({
      error:
        "Ce devis n'a pas de coût estimé (aucun produit choisi) : renseignez cout_estime_brut manuellement en base ou redemandez un devis avec produit_id",
    });
  }
  const brut = parseFloat(devis.rows[0].cout_estime_brut);
  const remise = parseFloat(remise_pourcentage) || 0;
  const transport = parseFloat(frais_transport) || 0;
  const divers = parseFloat(frais_divers) || 0;
  if (remise < 0 || remise > 100)
    return res
      .status(400)
      .json({ error: "remise_pourcentage doit être entre 0 et 100" });
  const total_final = brut * (1 - remise / 100) + transport + divers;
  const result = await pool.query(
    `UPDATE devis SET remise_pourcentage=$1, frais_transport=$2, frais_divers=$3, total_final=$4 WHERE id=$5 RETURNING *`,
    [remise, transport, divers, total_final, id],
  );
  res.json({ message: "Devis mis à jour", devis: result.rows[0] });
});

// Admin : Valider le devis (le rend payable, crée le chantier de suivi)
router.post("/:id/valider", verifyToken, async (req, res) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin requis" });
  const { id } = req.params;
  const devis = await pool.query(
    "SELECT total_final FROM devis WHERE id = $1",
    [id],
  );
  if (!devis.rows.length)
    return res.status(404).json({ error: "Devis non trouvé" });
  if (devis.rows[0].total_final === null) {
    return res.status(400).json({
      error:
        "Ajustez d'abord le prix du devis (PUT /api/devis/:id) avant de le valider",
    });
  }
  await pool.query("UPDATE devis SET statut = $1 WHERE id = $2", [
    "accepte",
    id,
  ]);
  const existing = await pool.query(
    "SELECT id FROM chantiers WHERE devis_id = $1",
    [id],
  );
  if (!existing.rows.length) {
    await pool.query(
      `INSERT INTO chantiers (devis_id, historique) VALUES ($1, $2)`,
      [
        id,
        JSON.stringify([
          { date: new Date().toISOString(), action: "Chantier créé" },
        ]),
      ],
    );
  }
  res.json({ message: "Devis validé, chantier créé" });
});

export default router;
