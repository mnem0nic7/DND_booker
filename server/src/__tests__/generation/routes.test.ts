import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import { prisma } from '../../config/database.js';

const TEST_USER = {
  email: 'gen-routes-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Routes Test',
};

let accessToken: string;
let userId: string;
let projectId: string;

describe('Generation Run Routes', () => {
  beforeAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
    userId = res.body.user.id;

    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Gen Route Project', type: 'one_shot' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects/:projectId/ai/generation-runs', () => {
    it('should create a run with valid input', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'A goblin cave adventure for level 4' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('queued');
      expect(res.body.mode).toBe('one_shot');
    });

    it('should reject missing prompt', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .send({ prompt: 'No auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs', () => {
    it('should list runs for the project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs/:runId', () => {
    it('should return a run with task and artifact counts', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Detail test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.taskCount).toBeDefined();
      expect(res.body.artifactCount).toBeDefined();
    });

    it('should return 404 for non-existent run', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST .../pause', () => {
    it('should pause a planning run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Pause test' });

      await prisma.generationRun.update({
        where: { id: createRes.body.id },
        data: { status: 'planning', startedAt: new Date() },
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/pause`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
    });
  });

  describe('POST .../cancel', () => {
    it('should cancel a queued run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Cancel test' });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });
  });

  describe('GET .../tasks', () => {
    it('should list tasks for a run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Tasks list test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET .../artifacts', () => {
    it('should list artifacts for a run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Artifacts list test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/artifacts`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
