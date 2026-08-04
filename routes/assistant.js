import express from 'express';
import axios from 'axios';
import pool from '../db.js';
import { verifyToken } from '../middleware/auth.js';
const router = express.Router();

// Assistant IA (avec OpenRouter gratuit)
router.post('/chat', verifyToken, async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message requis' });

  try {
    // Récupérer le contexte métier (catalogue, prix)
    const produits = await pool.query('SELECT nom, epaisseur, prix_ttc, statut_stock FROM produits LIMIT 10');
    const context = produits.rows.map(p => `${p.nom} (${p.epaisseur}) : ${p.prix_ttc} FCFA`).join(', ');

    const systemPrompt = `Vous êtes un assistant expert en panneaux fibrociment Luxerboard. 
    Contexte: ${context}
    Répondez en français, en 4-5 phrases maximum, orientez vers une prise de devis si pertinent.`;

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        max_tokens: 300,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://btt-lux.com',
          'X-Title': 'BTT-LUX Ap'
        }
      }
    );

    res.json({ response: response.data.choices[0].message.content });
  } catch (error) {
    console.error('Erreur IA:', error.response?.data || error.message);
    // Fallback: réponse basique si l'API échoue
    res.json({
      response: "Je suis actuellement indisponible. Contactez notre équipe commerciale au +237 6XX XXX XXX ou utilisez notre formulaire de devis."
    });
  }
});

export default router;