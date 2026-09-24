import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';

/**
 * Middleware de sécurité avancée pour BTT-Backend
 */

// Limite de taille du payload JSON (prévention DoS)
export const jsonPayloadLimit = '10mb';

// Générateur de nonce CSRF
export function generateCsrfToken() {
  return randomBytes(32).toString('hex');
}

// Middleware CSRF simple (pour les mutations sensibles)
export function csrfProtection(req, res, next) {
  // Exempter les webhooks et API machine-to-machine
  const exemptPaths = ['/api/paiements/webhook'];
  if (exemptPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  // Vérifier le token CSRF pour POST/PUT/PATCH/DELETE
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = req.session?.csrfToken;

    if (!csrfToken || csrfToken !== sessionToken) {
      return res.status(403).json({ 
        error: 'Token CSRF invalide ou manquant',
        code: 'CSRF_VALIDATION_FAILED' 
      });
    }
  }

  next();
}

// Rate limiter strict pour les endpoints sensibles
export const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives
  skipSuccessfulRequests: true,
  message: { 
    error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
    retryAfter: 15 * 60 
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Trop de tentatives de connexion',
      retryAfter: 15 * 60,
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Rate limiter modéré pour API générale
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { 
    error: 'Trop de requêtes, veuillez ralentir.',
    retryAfter: 15 * 60 
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Sanitisation des entrées (protection XSS basique)
export function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Échapper les balises HTML dangereuses
      return obj
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  // Sanitiser body, query et params
  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
}

// Middleware de timeout de requête
export function requestTimeout(timeoutMs = 30000) {
  return (req, res, next) => {
    req.setTimeout(timeoutMs, () => {
      res.status(408).json({ 
        error: 'La requête a expiré',
        code: 'REQUEST_TIMEOUT' 
      });
    });
    next();
  };
}

// Headers de sécurité additionnels
export function securityHeaders(req, res, next) {
  // Prévenir le sniffing MIME
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Protection XSS navigateur
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Empêcher l'iframe embedding (clickjacking)
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Strict Transport Security (HTTPS uniquement)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

export default {
  csrfProtection,
  generateCsrfToken,
  strictAuthLimiter,
  apiLimiter,
  sanitizeInput,
  requestTimeout,
  securityHeaders,
  jsonPayloadLimit
};
