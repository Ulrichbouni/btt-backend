export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
};

export const requestTimeout = (ms = 30000) => (req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Délai d’attente dépassé' });
    }
  }, ms);

  res.on('finish', () => res.clearTimeout(timeout));
  res.on('close', () => res.clearTimeout(timeout));
  next();
};

export const sanitizeInput = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = JSON.parse(JSON.stringify(req.body));
  }
  next();
};
