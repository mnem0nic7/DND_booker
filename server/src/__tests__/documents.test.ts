import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// These are integration tests that require a running PostgreSQL database.
// Run them with Docker Compose up: `docker compose up -d` then `cd server && npx vitest run src/__tests__/documents.test.ts`

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `doc-test-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;
let docId1: string;
let docId2: string;

describe('Document Routes', () => {
  beforeAll(async () => {
    // Create test user directly in DB (bcrypt rounds=4 for speed)
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Document Test User',
      },
    });
    userId = user.id;

    // Sign a JWT for auth
    accessToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    // Create a project to hold documents
    const project = await prisma.project.create({
      data: {
        title: 'Doc Test Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;

    // Create two ProjectDocument records
    const doc1 = await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        kind: 'chapter',
        title: 'Chapter One',
        slug: 'chapter-one',
        sortOrder: 0,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        status: 'draft',
      },
    });
    docId1 = doc1.id;

    const doc2 = await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        kind: 'chapter',
        title: 'Chapter Two',
        slug: 'chapter-two',
        sortOrder: 1,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        status: 'draft',
      },
    });
    docId2 = doc2.id;
  });

  afterAll(async () => {
    // Clean up in cascade-safe order
    await prisma.projectDocument.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('GET /api/projects/:projectId/documents', () => {
    it('should list project documents in sort order without content', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/documents`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      // Verify sort order
      expect(res.body[0].title).toBe('Chapter One');
      expect(res.body[0].sortOrder).toBe(0);
      expect(res.body[1].title).toBe('Chapter Two');
      expect(res.body[1].sortOrder).toBe(1);

      // Content should NOT be included in list response
      expect(res.body[0].content).toBeUndefined();
      expect(res.body[1].content).toBeUndefined();
    });
  });

  describe('GET /api/projects/:projectId/documents/:docId', () => {
    it('should return a single document with content', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/documents/${docId1}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(docId1);
      expect(res.body.title).toBe('Chapter One');
      expect(res.body.content).toBeDefined();
      expect(res.body.content.type).toBe('doc');
    });
  });

  describe('PUT /api/projects/:projectId/documents/:docId/content', () => {
    it('should update document content and set status to edited', async () => {
      const newContent = {
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'paragraph' }],
      };

      const res = await request(app)
        .put(`/api/projects/${projectId}/documents/${docId1}/content`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newContent);

      expect(res.status).toBe(200);
      expect(res.body.content.type).toBe('doc');
      expect(res.body.content.content).toHaveLength(2);
      expect(res.body.status).toBe('edited');
    });
  });

  describe('PUT /api/projects/:projectId/documents/:docId/title', () => {
    it('should update the document title', async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/documents/${docId2}/title`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Chapter Two Revised' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Chapter Two Revised');
    });
  });

  describe('POST /api/projects/:projectId/documents/reorder', () => {
    it('should change the sort order of documents', async () => {
      // Reverse the order: doc2 first, doc1 second
      const res = await request(app)
        .post(`/api/projects/${projectId}/documents/reorder`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ orderedIds: [docId2, docId1] });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      // doc2 should now be first (sortOrder 0), doc1 second (sortOrder 1)
      expect(res.body[0].id).toBe(docId2);
      expect(res.body[0].sortOrder).toBe(0);
      expect(res.body[1].id).toBe(docId1);
      expect(res.body[1].sortOrder).toBe(1);
    });
  });

  describe('404 for non-existent document', () => {
    it('should return 404 for a non-existent document ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/projects/${projectId}/documents/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document not found');
    });
  });
});
