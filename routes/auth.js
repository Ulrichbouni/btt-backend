import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
const router = express.Router();

// Inscription
router.post('/register', async (req, res) => {
  const { nom, email, telephone, mot_de_passe, role } = req.body;
  try {
    const hash = await bcrypt.hash(mot_de_passe, 10);
    const result = await pool.query(
      'INSERT INTO utilisateurs (nom, email, telephone, mot_de_passe_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [nom, email, telephone, hash, role || 'client']
    );
    res.status(201).json({ id: result.rows[0].id, message: 'Utilisateur créé' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;
  try {
    const user = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    if (user.rows.length === 0) return res.status(401).json({ error: 'Identifiants invalides' });
    const match = await bcrypt.compare(mot_de_passe, user.rows[0].mot_de_passe_hash);
    if (!match) return res.status(401).json({ error: 'Identifiants invalides' });
    const token = jwt.sign({ id: user.rows[0].id, role: user.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.rows[0].id, nom: user.rows[0].nom, role: user.rows[0].role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;