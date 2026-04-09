import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

const TEST_USER = {
  email: 'projects-v1-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Projects V1 Test User',
};

let accessToken: string;
let createdProjectId: string;

describe('Projects API v1', () => {
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
        note: 'projects v1 test',
      },
    });

    const res = await request(app).post('/api/v1/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.registrationInvite.deleteMany({ where: { email: TEST_USER.email } });
    await prisma.$disconnect();
  });

  it('creates and lists projects through api/v1', async () => {
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'V1 Campaign', description: 'Created via v1', type: 'campaign' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.title).toBe('V1 Campaign');
    expect(createRes.body.settings).toBeDefined();
    createdProjectId = createRes.body.id;

    const docs = await prisma.projectDocument.findMany({
      where: { projectId: createdProjectId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]?.title).toBe('V1 Campaign');

    const listRes = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.some((project: { id: string }) => project.id === createdProjectId)).toBe(true);
  });

  it('gets and updates a project through api/v1', async () => {
    const getRes = await request(app)
      .get(`/api/v1/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createdProjectId);
    expect(getRes.body.content?.type).toBe('doc');

    const doc = await prisma.projectDocument.findFirst({
      where: { projectId: createdProjectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    expect(doc).toBeTruthy();

    const updateRes = await request(app)
      .patch(`/api/v1/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Updated V1 Campaign',
        settings: {
          theme: 'dark-tome',
          textLayoutFallbacks: {
            [doc!.id]: {
              scopeIds: ['unit:test-node'],
            },
          },
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Updated V1 Campaign');
    expect(updateRes.body.settings.theme).toBe('dark-tome');
    expect(updateRes.body.settings.pageSize).toBeDefined();
  });

  it('updates aggregate project content through api/v1', async () => {
    const patchRes = await request(app)
      .patch(`/api/v1/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Aggregate Title' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Aggregate content saved through v1.' }] },
          ],
        },
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.content?.type).toBe('doc');
    expect(patchRes.body.content?.content?.[1]?.content?.[0]?.text).toBe('Aggregate content saved through v1.');

    const getRes = await request(app)
      .get(`/api/v1/projects/${createdProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.content?.content?.[1]?.content?.[0]?.text).toBe('Aggregate content saved through v1.');
  });

  it('deletes a project through api/v1', async () => {
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Delete Me' });

    expect(createRes.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/api/v1/projects/${createRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/v1/projects/${createRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
  });
});
