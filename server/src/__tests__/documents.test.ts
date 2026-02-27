import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

const TEST_USER = {
  email: 'document-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Document Test User',
};

let accessToken: string;
let userId: string;
let projectId: string;
let createdDocId: string;
let secondDocId: string;

describe('Documents API', () => {
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

    // Create a project to hold documents
    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Doc Test Project' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects/:projectId/documents', () => {
    it('should create a document with valid data', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Chapter 1' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Chapter 1');
      expect(res.body.projectId).toBe(projectId);
      expect(res.body.sortOrder).toBe(0);
      expect(res.body.content).toBeDefined();
      createdDocId = res.body.id;
    });

    it('should create a second document with incremented sortOrder', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Chapter 2' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Chapter 2');
      expect(res.body.sortOrder).toBe(1);
      secondDocId = res.body.id;
    });

    it('should create a document with custom content', async () => {
      const customContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] };
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Chapter 3', content: customContent });

      expect(res.status).toBe(201);
      expect(res.body.content).toEqual(customContent);
    });

    it('should reject creation without a title', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Orphan Doc' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .send({ title: 'No Auth' });

      expect(res.status).toBe(401);
    });

    it('should reject content that is not a valid TipTap object', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Bad Content', content: 'just a string' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject content missing required type field', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Bad Content', content: { content: [] } });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid TipTap JSON content', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Valid Content',
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.content.type).toBe('doc');
    });
  });

  describe('GET /api/projects/:projectId/documents', () => {
    it('should list documents ordered by sortOrder', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      // Verify sorted order
      for (let i = 1; i < res.body.length; i++) {
        expect(res.body[i].sortOrder).toBeGreaterThanOrEqual(res.body[i - 1].sortOrder);
      }
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/documents')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/documents`);

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/documents/:id', () => {
    it('should update a document title', async () => {
      const res = await request(app)
        .put(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Chapter 1 - Revised' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Chapter 1 - Revised');
    });

    it('should update document content', async () => {
      const newContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] };
      const res = await request(app)
        .put(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ content: newContent });

      expect(res.status).toBe(200);
      expect(res.body.content).toEqual(newContent);
    });

    it('should return 404 for non-existent document', async () => {
      const res = await request(app)
        .put('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Ghost' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .put(`/api/documents/${createdDocId}`)
        .send({ title: 'No Auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/documents/:id (rename)', () => {
    it('should rename a document title', async () => {
      const res = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Renamed Chapter' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Renamed Chapter');
      expect(res.body.id).toBe(createdDocId);
    });

    it('should reject empty title', async () => {
      const res = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent document', async () => {
      const res = await request(app)
        .patch('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Ghost' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .patch(`/api/documents/${createdDocId}`)
        .send({ title: 'No Auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/documents/reorder', () => {
    it('should reorder documents', async () => {
      // Reverse the order: second doc first, then first doc
      const res = await request(app)
        .patch('/api/documents/reorder')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ projectId, documentIds: [secondDocId, createdDocId] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the new order
      const listRes = await request(app)
        .get(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`);

      const docs = listRes.body;
      const secondDoc = docs.find((d: any) => d.id === secondDocId);
      const firstDoc = docs.find((d: any) => d.id === createdDocId);
      expect(secondDoc.sortOrder).toBeLessThan(firstDoc.sortOrder);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .patch('/api/documents/reorder')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ projectId: '00000000-0000-0000-0000-000000000000', documentIds: [createdDocId] });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });

    it('should reject invalid body', async () => {
      const res = await request(app)
        .patch('/api/documents/reorder')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ projectId: 'not-a-uuid', documentIds: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .patch('/api/documents/reorder')
        .send({ projectId, documentIds: [createdDocId] });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/documents/:id', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/documents/${createdDocId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent document', async () => {
      const res = await request(app)
        .delete('/api/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });

    it('should delete a document', async () => {
      const res = await request(app)
        .delete(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(204);

      // Verify it's gone by trying to update it
      const updateRes = await request(app)
        .put(`/api/documents/${createdDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Should Fail' });

      expect(updateRes.status).toBe(404);
    });
  });
});
