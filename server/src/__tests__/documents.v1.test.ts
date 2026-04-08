import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `doc-v1-test-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;
let docId: string;

describe('Document API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Document V1 Test User',
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
        title: 'Doc V1 Test Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;

    const doc = await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        kind: 'chapter',
        title: 'Chapter Alpha',
        slug: 'chapter-alpha',
        sortOrder: 0,
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Alpha' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'The story begins.' }] },
          ],
        },
        status: 'draft',
      },
    });
    docId = doc.id;
  });

  afterAll(async () => {
    await prisma.projectDocument.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('exposes canonical, editor, and Typst snapshots', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.documentId).toBe(docId);
    expect(res.body.canonicalDocJson).toBeDefined();
    expect(res.body.editorProjectionJson).toBeDefined();
    expect(res.body.typstSource).toContain('Chapter Alpha');
  });

  it('returns canonical doc, editor projection, and typst endpoints', async () => {
    const canonical = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}/canonical`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(canonical.status).toBe(200);
    expect(canonical.body.type).toBe('doc');

    const projection = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}/editor-projection`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(projection.status).toBe(200);
    expect(projection.body.type).toBe('doc');

    const typst = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}/typst`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(typst.status).toBe(200);
    expect(typst.body.documentId).toBe(docId);
    expect(typst.body.typstSource).toContain('Chapter Alpha');
  });

  it('applies editor patches and keeps the snapshots in sync', async () => {
    const patch = {
      title: 'Chapter Alpha Revised',
      editorProjectionJson: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Alpha Revised' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'The story continues.' }] },
        ],
      },
    };

    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(patch);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Chapter Alpha Revised');
    expect(res.body.editorProjectionJson.content[1].content[0].text).toBe('The story continues.');
    expect(res.body.typstSource).toContain('Chapter Alpha Revised');

    const updated = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Chapter Alpha Revised');
    expect(updated.body.typstSource).toContain('Chapter Alpha Revised');
  });

  it('updates layout plans through the v1 document route', async () => {
    const patch = {
      version: 1,
      sectionRecipe: 'chapter_hero_split',
      columnBalanceTarget: 'balanced',
      blocks: [
        {
          nodeId: 'hero-node',
          presentationOrder: 0,
          span: 'both_columns',
          placement: 'hero_top',
          groupId: null,
          keepTogether: true,
          allowWrapBelow: false,
        },
      ],
    };

    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/documents/${docId}/layout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(patch);

    expect(res.status).toBe(200);
    expect(res.body.layoutPlan?.version).toBe(1);
    expect(res.body.layoutPlan?.sectionRecipe).toBe('chapter_hero_split');
    expect(res.body.layoutPlan?.columnBalanceTarget).toBe('balanced');
    expect(Array.isArray(res.body.layoutPlan?.blocks)).toBe(true);
    expect(res.body.layoutPlan.blocks.length).toBeGreaterThan(0);

    const updated = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(updated.status).toBe(200);
    expect(updated.body.layoutPlan?.sectionRecipe).toBe('chapter_hero_split');
    expect(updated.body.layoutPlan?.columnBalanceTarget).toBe('balanced');
    expect(updated.body.layoutPlan.blocks.length).toBeGreaterThan(0);
  });
});
