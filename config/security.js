export function validateSecurityConfig() {
  const required = [
    'JWT_SECRET',
    'FRONTEND_URL',
    'CAMPAY_API_KEY',
    'CAMPAY_SECRET',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'OPENROUTER_API_KEY',
  ];

  for (const key of required) {
    if (process.env[key] && process.env[key].trim() === '') {
      throw new Error(`Configuration de sécurité invalide : ${key} est vide`);
    }
  }
}
