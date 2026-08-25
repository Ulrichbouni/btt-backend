import { validate, registerSchema, loginSchema, devisSchema, calculateurSchema, missionSchema, mesuresSchema, paiementSchema, produitSchema, professionnelSchema } from '../../middleware/validation.js';

describe('Validation Schemas', () => {
  
  describe('registerSchema', () => {
    it('should accept valid registration data', () => {
      const validData = {
        nom: 'Jean Dupont',
        email: 'jean@example.com',
        telephone: '+237612345678',
        mot_de_passe: 'password123',
        role: 'client'
      };
      
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject short name', () => {
      const invalidData = {
        nom: 'J',
        email: 'jean@example.com',
        mot_de_passe: 'password123'
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('should accept valid login data', () => {
      const validData = {
        email: 'jean@example.com',
        mot_de_passe: 'password123'
      };
      
      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid',
        mot_de_passe: 'password123'
      };
      
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('devisSchema', () => {
    it('should accept valid devis data', () => {
      const validData = {
        surface: 100,
        ville: 'Douala',
        adresse: '123 Rue de la Paix',
        date_souhaitee: '2024-12-31T00:00:00.000Z'
      };
      
      const result = devisSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative surface', () => {
      const invalidData = {
        surface: -10,
        ville: 'Douala',
        adresse: '123 Rue'
      };
      
      const result = devisSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('calculateurSchema', () => {
    it('should accept valid calculator data', () => {
      const validData = {
        longueur: 10,
        largeur: 5,
        type_batiment: 'residentiel',
        produit_id: 1
      };
      
      const result = calculateurSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type_batiment', () => {
      const invalidData = {
        longueur: 10,
        largeur: 5,
        type_batiment: 'invalid',
        produit_id: 1
      };
      
      const result = calculateurSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('missionSchema', () => {
    it('should accept valid mission data', () => {
      const validData = {
        devis_id: 1,
        technicien_id: 2,
        date_visite: '2024-12-31T00:00:00.000Z'
      };
      
      const result = missionSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('paiementSchema', () => {
    it('should accept valid payment data', () => {
      const validData = {
        montant: 100000,
        methode: 'orange_money'
      };
      
      const result = paiementSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative amount', () => {
      const invalidData = {
        montant: -100,
        methode: 'orange_money'
      };
      
      const result = paiementSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('produitSchema', () => {
    it('should accept valid product data', () => {
      const validData = {
        nom: 'Panneau Luxerboard',
        epaisseur: '10mm',
        categorie: 'fibrociment',
        prix_ttc: 15000,
        poids_unite: 12.5,
        qte_conteneur: 200
      };
      
      const result = produitSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('professionnelSchema', () => {
    it('should accept valid professional data', () => {
      const validData = {
        nom: 'Jean Dupont',
        role: 'poseur',
        ville: 'Douala',
        telephone: '+237612345678'
      };
      
      const result = professionnelSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid phone number', () => {
      const invalidData = {
        nom: 'Jean Dupont',
        role: 'poseur',
        ville: 'Douala',
        telephone: '123'
      };
      
      const result = professionnelSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('validate middleware', () => {
    it('should call next() for valid data', () => {
      const req = { body: { email: 'test@example.com', mot_de_passe: 'motdepasse' } };
      const res = {};
      const next = jest.fn();
      
      const middleware = validate(loginSchema);
      middleware(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 for invalid data', () => {
      const req = { body: { email: 'invalid' } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();
      
      const middleware = validate(loginSchema);
      middleware(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
