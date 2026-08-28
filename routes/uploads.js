import express from "express";
import { verifyToken } from "../middleware/auth.js";
import { upload, publicUrl } from "../services/upload.js";

const router = express.Router();

// Upload de fichier(s) : photos de measures, plans, pieces jointes
router.post("/", verifyToken, upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "Aucun fichier fourni" });
    }
    const urls = req.files.map((f) => ({
      filename: f.filename,
      url: publicUrl(req, f.filename),
      size: f.size,
      mimetype: f.mimetype
    }));
    res.status(201).json({ files: urls });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(400).json({ error: err.message || "Erreur upload" });
  }
});

// Upload d'une seule photo (simplifie l'appel et return le tableau photo_urls)
router.post("/photo", verifyToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier" });
    res.status(201).json({ url: publicUrl(req, req.file.filename), filename: req.file.filename });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;