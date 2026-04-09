import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const TEST_EMAIL = `export-v1-${Date.now()}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;

describe('Export API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Export V1 Test User',
      },
    });
    userId = user.id;

    accessToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    const project = await prisma.project.create({
      data: {
        title: 'Legacy Export Source Project',
        type: 'one_shot',
        userId: user.id,
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Legacy Export Source Project' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Legacy content should be materialized before export.' }] },
          ],
        },
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.exportJob.deleteMany({ where: { userId } });
    await prisma.projectDocument.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('materializes project documents before queueing a v1 export job', async () => {
    const beforeCount = await prisma.projectDocument.count({ where: { projectId } });
    expect(beforeCount).toBe(0);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/export-jobs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ format: 'pdf' });

    expect(res.status).toBe(201);
    expect(res.body.projectId).toBe(projectId);
    expect(res.body.status).toBe('queued');

    const documents = await prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.some((document) => (document.typstSource ?? '').includes('Legacy Export Source Project'))).toBe(true);
    expect(documents.some((document) => JSON.stringify(document.canonicalDocJson).includes('Legacy content should be materialized'))).toBe(true);
  });
});
