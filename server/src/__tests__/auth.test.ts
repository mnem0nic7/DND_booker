import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

// These are integration tests that require a running PostgreSQL database.
// Run them with Docker Compose up: `docker compose up -d` then `cd server && npm test`

const TEST_USER = {
  email: 'test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Test User',
};

describe('Auth API', () => {
  beforeAll(async () => {
    // Clean up any existing test user
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should reject registration when email is not allowlisted', async () => {
      process.env.REGISTRATION_ALLOWED_EMAILS = 'm7.ga.77@gmail.com';

      const res = await request(app).post('/api/auth/register').send(TEST_USER);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Registration is not allowed for this email');

      delete process.env.REGISTRATION_ALLOWED_EMAILS;
    });

    it('should register a new user and return tokens', async () => {
      const res = await request(app).post('/api/auth/register').send(TEST_USER);

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.user.displayName).toBe(TEST_USER.displayName);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
      // Ensure password hash is not returned
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject duplicate email registration', async () => {
      const res = await request(app).post('/api/auth/register').send(TEST_USER);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already registered');
    });

    it('should reject weak passwords', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'weak@example.com',
        password: 'weak',
        displayName: 'Weak Password User',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'not-an-email',
        password: 'StrongP@ss1',
        displayName: 'Bad Email User',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: TEST_USER.email,
        password: TEST_USER.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(TEST_USER.email);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: TEST_USER.email,
        password: 'WrongP@ss1',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should reject non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com',
        password: 'StrongP@ss1',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh the access token with a valid refresh cookie', async () => {
      // First login to get a refresh token cookie
      const loginRes = await request(app).post('/api/auth/login').send({
        email: TEST_USER.email,
        password: TEST_USER.password,
      });

      const cookies = loginRes.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', Array.isArray(cookies) ? cookies : [cookies]);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('should reject when no refresh token cookie is present', async () => {
      const res = await request(app).post('/api/auth/refresh');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No refresh token');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the refresh token cookie', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out');
    });
  });
});
