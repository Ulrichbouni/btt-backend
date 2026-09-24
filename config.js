/**
 * Configuration centralisée de l'application BTT-Backend
 * Toutes les variables d'environnement sont validées ici
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

// Schéma de validation des variables d'environnement
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().regex(/^\d+$/).transform(Number).default('5000'),
  
  // Database
  DATABASE_URL: z.string().url('DATABASE_URL doit être une URL PostgreSQL valide'),
  
  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit faire au moins 32 caractères'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  
  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  
  // Email (optional)
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.string().regex(/^\d+$/).transform(Number).optional(),
  EMAIL_USER: z.string().email().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // Twilio (optional)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),
  
  // Campay (optional)
  CAMPAY_USERNAME: z.string().optional(),
  CAMPAY_PASSWORD: z.string().optional(),
  CAMPAY_API_URL: z.string().url().optional(),
  CAMPAY_WEBHOOK_SECRET: z.string().optional(),
  
  // OpenRouter IA (optional)
  OPENROUTER_API_KEY: z.string().optional(),
  
  // Sécurité
  BCRYPT_ROUNDS: z.string().regex(/^\d+$/).transform(Number).default('10'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).transform(Number).default('900000'), // 15 min
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).default('100'),
  
  // Admin initial (pour seeding)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12).optional(),
});

// Validation et export
let env;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Variables d\'environnement invalides:');
  if (error instanceof z.ZodError) {
    error.errors.forEach(err => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });
  }
  process.exit(1);
}

export const config = {
  // Environnement
  env: env.NODE_ENV,
  port: env.PORT,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // Database
  database: {
    url: env.DATABASE_URL,
  },
  
  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  
  // Frontend
  frontend: {
    url: env.FRONTEND_URL,
  },
  
  // Email
  email: {
    host: env.EMAIL_HOST,
    port: env.EMAIL_PORT,
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
    from: env.EMAIL_FROM || env.EMAIL_USER,
    enabled: !!(env.EMAIL_HOST && env.EMAIL_USER && env.EMAIL_PASS),
  },
  
  // Twilio
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
    whatsappNumber: env.TWILIO_WHATSAPP_NUMBER,
    enabled: !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN),
  },
  
  // Campay
  campay: {
    username: env.CAMPAY_USERNAME,
    password: env.CAMPAY_PASSWORD,
    apiUrl: env.CAMPAY_API_URL,
    webhookSecret: env.CAMPAY_WEBHOOK_SECRET,
    enabled: !!(env.CAMPAY_USERNAME && env.CAMPAY_PASSWORD),
  },
  
  // OpenRouter
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY,
    enabled: !!env.OPENROUTER_API_KEY,
  },
  
  // Sécurité
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Admin
  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  },
};

export default config;
