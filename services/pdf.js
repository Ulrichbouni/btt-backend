import PDFDocument from "pdfkit";
import pool from "../db.js";

export function buildDevisPDF(devis, client) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // En-tête
      doc.fillColor("#92400e").fontSize(22).font("Helvetica-Bold")
        .text("BTT-LUX", { align: "left" });
      doc.fontSize(10).fillColor("#666").text("Panneaux fibrociment & installations", { align: "left" });
      doc.moveDown();
      doc.fillColor("#92400e").fontSize(16).text("DEVIS #" + devis.id, { align: "right" });
      doc.fontSize(10).fillColor("#888").text("Date: " + new Date(devis.created_at).toLocaleDateString("fr-FR"), { align: "right" });

      doc.moveDown().strokeColor("#f59e0b").lineWidth(1.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Client
      doc.fillColor("#333").fontSize(12).text("Client: " + (client.nom || "—"));
      doc.text("Email: " + (client.email || "—"));
      doc.text("Téléphone: " + (client.telephone || "—"));
      doc.text("Ville: " + (devis.ville || "—"));
      doc.text("Adresse: " + (devis.adresse || "—"));
      doc.moveDown();

      // Détails techniques
      doc.fillColor("#111").fontSize(12).font("Helvetica-Bold").text("Détails techniques");
      doc.font("Helvetica").moveDown(0.5);
      const rows = [
        ["Surface", devis.surface + " m²"],
        ["Étage", devis.etage?.toString() || "—"],
        ["Nombre de panneaux", devis.nb_panneaux?.toString() || "—"],
        ["Prix unitaire", devis.prix_unitaire ? devis.prix_unitaire.toLocaleString() + " FCFA" : "—"],
      ];
      rows.forEach(([k, v]) => {
        doc.moveDown(0.3);
        doc.text(k + ":", { continued: true }).fillColor("#666").text("  " + v, { color: "#666" });
        doc.fillColor("#111");
      });

      doc.moveDown().strokeColor("#f59e0b").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown();

      // Montants
      doc.fillColor("#111").font("Helvetica-Bold").text("Montants");
      doc.font("Helvetica").moveDown(0.4);
      const amounts = [
        ["Coût estimé brut", devis.cout_estime_brut],
        ["Remise (%)", devis.remise_pourcentage],
        ["Frais transport", devis.frais_transport],
        ["Frais divers", devis.frais_divers],
      ];
      amounts.forEach(([k, v]) => {
        if (v === null || v === undefined) return;
        doc.moveDown(0.3);
        doc.text(k + ":", { continued: true }).fillColor("#666").text("  " + (typeof v === "number" ? v.toLocaleString() + " FCFA" : v + " %"), { color: "#666" });
        doc.fillColor("#111");
      });

      doc.moveDown();
      doc.fillColor("#92400e").fontSize(16).font("Helvetica-Bold").text("TOTAL: " + (devis.total_final ?? 0).toLocaleString() + " FCFA", { align: "right" });
      doc.moveDown(2);
      doc.fontSize(10).fillColor("#888").text("Ce devis est valable 30 jours. Paiement via Mobile Money (Orange/MTN).", { align: "center" });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function getDevisPDF(devisId) {
  const result = await pool.query(
    `SELECT d.*, u.nom, u.email, u.telephone
     FROM devis d JOIN utilisateurs u ON d.utilisateur_id = u.id
     WHERE d.id = $1`,
    [devisId]
  );
  if (!result.rows.length) throw new Error("Devis introuvable");
  const row = result.rows[0];
  const devis = {
    id: row.id, ville: row.ville, adresse: row.adresse, etage: row.etage,
    surface: row.surface, nb_panneaux: row.nb_panneaux, prix_unitaire: row.prix_unitaire,
    cout_estime_brut: row.cout_estime_brut, remise_pourcentage: row.remise_pourcentage,
    frais_transport: row.frais_transport, frais_divers: row.frais_divers,
    total_final: row.total_final, created_at: row.created_at
  };
  const client = {
    nom: row.nom, email: row.email, telephone: row.telephone
  };
  return buildDevisPDF(devis, client);
}

export default { buildDevisPDF, getDevisPDF };