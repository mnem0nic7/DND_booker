import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

const TEST_USER = {
  email: 'asset-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Asset Test User',
};

let accessToken: string;
let projectId: string;

describe('Assets API', () => {
  beforeAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.asset.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;

    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Asset Test Project' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (user) {
      await prisma.asset.deleteMany({ where: { userId: user.id } });
      await prisma.project.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects/:projectId/assets', () => {
    it('should reject request without file', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No file');
    });

    it('should upload an image file', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('fake-png-data'), {
          filename: 'test-image.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(201);
      expect(res.body.filename).toBe('test-image.png');
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.url).toContain(`/uploads/${projectId}/`);
    });

    it('should reject SVG uploads', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('<svg></svg>'), {
          filename: 'test.svg',
          contentType: 'image/svg+xml',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Only image files are allowed');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/assets')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('fake-png-data'), {
          filename: 'test.png',
          contentType: 'image/png',
        });

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/assets`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:projectId/assets', () => {
    it('should list assets for a project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/assets')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/assets`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/assets/:id', () => {
    it('should delete an asset', async () => {
      // First create an asset to delete
      const uploadRes = await request(app)
        .post(`/api/projects/${projectId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('delete-me'), {
          filename: 'delete-me.png',
          contentType: 'image/png',
        });

      const assetId = uploadRes.body.id;

      const res = await request(app)
        .delete(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);
    });

    it('should return 404 for non-existent asset', async () => {
      const res = await request(app)
        .delete('/api/assets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete('/api/assets/some-id');

      expect(res.status).toBe(401);
    });
  });
});
