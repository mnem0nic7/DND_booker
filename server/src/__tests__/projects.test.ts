import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

// These are integration tests that require a running PostgreSQL database.
// Run them with Docker Compose up: `docker compose up -d` then `cd server && npm test`

const TEST_USER = {
  email: 'project-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Project Test User',
};

let accessToken: string;
let userId: string;
let createdProjectId: string;

describe('Projects API', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // Register a test user and get an access token
    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects', () => {
    it('should create a project with valid data', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'My Campaign', description: 'A test campaign', type: 'campaign' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('My Campaign');
      expect(res.body.description).toBe('A test campaign');
      expect(res.body.type).toBe('campaign');
      expect(res.body.status).toBe('draft');
      expect(res.body.settings).toBeDefined();
      expect(res.body.id).toBeDefined();

      createdProjectId = res.body.id;
    });

    it('should create a project with only a title', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Minimal Project' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Minimal Project');
      expect(res.body.description).toBe('');
      expect(res.body.type).toBe('campaign');
    });

    it('should reject creation without a title', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'No title provided' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ title: 'Unauthorized' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects', () => {
    it('should list user projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      // Should include document count
      expect(res.body[0]._count).toBeDefined();
      expect(res.body[0]._count.documents).toBeDefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should get a single project with documents', async () => {
      const res = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdProjectId);
      expect(res.body.title).toBe('My Campaign');
      expect(res.body.documents).toBeDefined();
      expect(Array.isArray(res.body.documents)).toBe(true);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get(`/api/projects/${createdProjectId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/projects/:id', () => {
    it('should update a project', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated Campaign', status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Campaign');
      expect(res.body.status).toBe('in_progress');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .put('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Ghost Project' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .send({ title: 'Unauthorized Update' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).delete(`/api/projects/${createdProjectId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should delete a project', async () => {
      const res = await request(app)
        .delete(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(getRes.status).toBe(404);
    });
  });
});
