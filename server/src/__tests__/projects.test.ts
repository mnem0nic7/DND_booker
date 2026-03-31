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

      const docs = await prisma.projectDocument.findMany({
        where: { projectId: createdProjectId },
        orderBy: { sortOrder: 'asc' },
      });
      expect(docs).toHaveLength(1);
      expect(docs[0].kind).toBe('chapter');
      expect(docs[0].title).toBe('My Campaign');
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
      // List should not include content (too large for listing)
      expect(res.body[0].content).toBeUndefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/projects');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should get a single project with content', async () => {
      const res = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdProjectId);
      expect(res.body.title).toBe('My Campaign');
      expect(res.body.content).toBeDefined();
      expect(res.body.content.type).toBe('doc');
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

    it('should update project settings with valid theme', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ settings: { theme: 'dark-tome' } });

      expect(res.status).toBe(200);
    });

    it('should merge settings without overwriting existing keys', async () => {
      // First verify default settings exist
      const getRes = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      const originalSettings = getRes.body.settings;
      expect(originalSettings.pageSize).toBeDefined();
      expect(originalSettings.columns).toBeDefined();

      // Update only theme
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ settings: { theme: 'fey-wild' } });

      expect(res.status).toBe(200);
      expect(res.body.settings.theme).toBe('fey-wild');
      // Verify other settings were preserved
      expect(res.body.settings.pageSize).toBe(originalSettings.pageSize);
      expect(res.body.settings.columns).toBe(originalSettings.columns);
    });

    it('should accept typed text layout fallback settings', async () => {
      const doc = await prisma.projectDocument.findFirst({
        where: { projectId: createdProjectId },
        orderBy: { sortOrder: 'asc' },
        select: { id: true },
      });
      expect(doc).toBeTruthy();

      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          settings: {
            textLayoutFallbacks: {
              [doc!.id]: {
                scopeIds: ['unit:test-node', 'group:test-group'],
              },
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.settings.textLayoutFallbacks[doc!.id].scopeIds).toEqual([
        'unit:test-node',
        'group:test-group',
      ]);
      expect(res.body.settings.theme).toBeDefined();
    });

    it('should reject invalid theme in settings', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ settings: { theme: 'nonexistent-theme' } });

      expect(res.status).toBe(400);
    });

    it('should reject invalid columns in settings', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ settings: { columns: 5 } });

      expect(res.status).toBe(400);
    });

    it('should strip unknown keys from settings (prevent injection)', async () => {
      // First get the current settings to know the baseline
      const before = await request(app)
        .get(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      const knownKeys = Object.keys(before.body.settings);

      // Send settings with an injected key
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ settings: { theme: 'classic-parchment', maliciousKey: 'evil-data' } });

      expect(res.status).toBe(200);
      expect(res.body.settings.theme).toBe('classic-parchment');
      // The malicious key should have been stripped by Zod .strip()
      expect(res.body.settings.maliciousKey).toBeUndefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}`)
        .send({ title: 'Unauthorized Update' });

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/projects/:id/content', () => {
    it('should update project content', async () => {
      const content = {
        type: 'doc',
        content: [
          { type: 'titlePage', attrs: { title: 'Updated Campaign', subtitle: 'One-Shot' } },
          { type: 'pageBreak' },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Act One' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'The road to the dungeon begins here.' }] },
          { type: 'pageBreak' },
          { type: 'creditsPage', attrs: { credits: 'Written by Test Author' } },
        ],
      };
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}/content`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(content);

      expect(res.status).toBe(200);
      expect(res.body.content.type).toBe('doc');

      const docs = await prisma.projectDocument.findMany({
        where: { projectId: createdProjectId },
        orderBy: { sortOrder: 'asc' },
        select: { title: true, kind: true, slug: true },
      });
      expect(docs).toEqual([
        { title: 'Title Page', kind: 'front_matter', slug: 'title-page' },
        { title: 'Act One', kind: 'chapter', slug: 'act-one' },
        { title: 'Credits', kind: 'back_matter', slug: 'credits' },
      ]);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .put('/api/projects/00000000-0000-0000-0000-000000000000/content')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ type: 'doc', content: [] });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid content', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}/content`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ invalid: true });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put(`/api/projects/${createdProjectId}/content`)
        .send({ type: 'doc', content: [] });

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
