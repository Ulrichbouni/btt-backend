import pool from '../db.js';
import { verifyAuthToken, currentAuthVersion } from '../config/auth.js';

export const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Accès refusé' });
  try {
    const decoded = verifyAuthToken(token);
    const result = await pool.query(
      'SELECT id, role, auth_version FROM utilisateurs WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Utilisateur introuvable' });
    const user = result.rows[0];
    // Révocation des sessions : un changement de mot de passe / réinitialisation
    // incrémente auth_version en base et invalide les anciens JWT.
    // Les JWT émis avant l'ajout de auth_version (sans claim) restent acceptés
    // pour ne pas couper les sessions existantes à la mise à jour.
    const tokenVersion = Number.isInteger(decoded.auth_version) ? decoded.auth_version : null;
    if (tokenVersion !== null && tokenVersion !== currentAuthVersion(user)) {
      return res.status(401).json({ error: 'Session expirée, reconnectez-vous' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};

export const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  next();
};