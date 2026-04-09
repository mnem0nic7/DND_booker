import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

const TEST_USER = {
  email: 'template-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Template Test User',
};

let accessToken: string;

describe('Templates API', () => {
  beforeAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.registrationInvite.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.registrationInvite.create({
      data: {
        email: TEST_USER.email,
        note: 'templates test',
      },
    });
    const res = await request(app).post('/api/v1/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.registrationInvite.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
  });

  describe('GET /api/v1/templates', () => {
    it('should return an array of templates', async () => {
      const res = await request(app)
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter templates by type', async () => {
      const res = await request(app)
        .get('/api/v1/templates?type=campaign')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const template of res.body) {
        expect(template.type).toBe('campaign');
      }
    });

    it('should list templates through /api/v1/templates', async () => {
      const res = await request(app)
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/v1/templates/:id', () => {
    it('should return 404 for non-existent template', async () => {
      const res = await request(app)
        .get('/api/v1/templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Template not found');
    });

    it('should return a template by ID if one exists', async () => {
      const listRes = await request(app)
        .get('/api/v1/templates')
        .set('Authorization', `Bearer ${accessToken}`);

      if (listRes.body.length > 0) {
        const templateId = listRes.body[0].id;
        const res = await request(app)
          .get(`/api/templates/${templateId}`)
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(templateId);
        expect(res.body.name).toBeDefined();
      }
    });
  });
});
