import request from 'supertest';
import { app } from '../helpers/test-app.js';

describe('Auth API Integration', () => {
  
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          nom: 'Test User',
          email: 'test@example.com',
          mot_de_passe: 'password123',
          role: 'client'
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('message');
      expect(response.body.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          nom: 'Test User',
          email: 'duplicate@example.com',
          mot_de_passe: 'password123'
        });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          nom: 'Another User',
          email: 'duplicate@example.com',
          mot_de_passe: 'password123'
        });
      
      expect(response.status).toBe(409);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          nom: 'Test User',
          email: 'invalid-email',
          mot_de_passe: 'password123'
        });
      
      expect(response.status).toBe(400);
    });

    it('should reject short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          nom: 'Test User',
          email: 'test@example.com',
          mot_de_passe: '12345'
        });
      
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          mot_de_passe: 'wrongpassword'
        });
      
      expect(response.status).toBe(401);
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid',
          mot_de_passe: 'password123'
        });
      
      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          mot_de_passe: 'password'
        });
      
      expect([401, 400]).toContain(response.status);
    });
  });
});
