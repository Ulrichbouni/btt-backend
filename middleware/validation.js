import { z } from 'zod';

// Schémas de validation réutilisables

export const registerSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(100),
  email: z.string().email('Email invalide'),
  telephone: z.string().regex(/^\+?[0-9]{8,15}$/, 'Numéro de téléphone invalide').optional(),
  mot_de_passe: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  role: z.enum(['client', 'technicien', 'admin']).default('client')
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  mot_de_passe: z.string().min(1, 'Mot de passe requis'),
  otp_token: z.string().length(6, 'Code OTP doit contenir 6 chiffres').optional()
});

export const devisSchema = z.object({
  surface: z.number().positive('Surface doit être positive'),
  ville: z.string().min(2, 'Ville requise'),
  adresse: z.string().min(5, 'Adresse requise'),
  date_souhaitee: z.string().datetime().optional(),
  photos: z.array(z.string().url()).optional(),
  plans: z.array(z.string().url()).optional()
});

export const calculateurSchema = z.object({
  longueur: z.number().positive('Longueur doit être positive'),
  largeur: z.number().positive('Largeur doit être positive'),
  type_batiment: z.enum(['residentiel', 'commercial', 'industriel']),
  etage: z.number().int().nonnegative('Étage doit être positif').optional(),
  epaisseur: z.string().optional(),
  produit_id: z.number().int().positive('Produit ID invalide')
});

export const missionSchema = z.object({
  devis_id: z.number().int().positive('Devis ID invalide'),
  technicien_id: z.number().int().positive('Technicien ID invalide'),
  date_visite: z.string().datetime()
});

export const mesuresSchema = z.object({
  longueur_murs: z.number().positive(),
  hauteur_sous_plafond: z.number().positive(),
  surface_ouverte: z.number().nonnegative().optional(),
  perimetre: z.number().positive().optional(),
  photo_urls: z.array(z.string().url()).optional(),
  croquis_url: z.string().url().optional()
});

export const paiementSchema = z.object({
  devis_id: z.number().int().positive().optional(),
  montant: z.number().positive('Montant doit être positif'),
  methode: z.enum(['orange_money', 'mtn', 'stripe', 'carte', 'virement']),
  telephone: z.string().optional(),
  num_carte: z.string().optional(),
  expiration: z.string().optional(),
  cvc: z.string().length(3, 'CVC doit contenir 3 chiffres').optional()
});

export const produitSchema = z.object({
  nom: z.string().min(2).max(200),
  nom_en: z.string().optional(),
  epaisseur: z.string(),
  categorie: z.string(),
  application: z.string().optional(),
  application_en: z.string().optional(),
  prix_ttc: z.number().positive('Prix TTC doit être positif'),
  poids_unite: z.number().positive('Poids unitaire doit être positif'),
  qte_conteneur: z.number().int().positive('Quantité conteneur invalide'),
  statut_stock: z.string().default('disponible')
});

export const professionnelSchema = z.object({
  nom: z.string().min(2).max(100),
  role: z.string(),
  ville: z.string().min(2),
  telephone: z.string().regex(/^\+?[0-9]{8,15}$/),
  niveau_certification: z.string().optional(),
  note: z.number().min(0).max(5).optional(),
  nb_chantiers: z.number().int().nonnegative().optional()
});

// Middleware générique de validation
export const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Données invalides',
          details: error.errors.map(e => ({
            champ: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next();
    }
  };
};

// Validation des paramètres d'URL
export const validateParams = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Paramètres invalides',
          details: error.errors.map(e => ({
            champ: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next();
    }
  };
};

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'ID doit être un nombre')
});

export const missionIdParamSchema = z.object({
  mission_id: z.string().regex(/^\d+$/, 'Mission ID doit être un nombre')
});