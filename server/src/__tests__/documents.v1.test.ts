import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { buildLayoutDocumentV2 } from '@dnd-booker/shared';
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
    expect(res.body.layoutSnapshotJson).toBeDefined();
    expect(res.body.layoutSnapshotJson.version).toBe(2);
    expect(res.body.layoutEngineVersion).toBe(2);
    expect(typeof res.body.layoutSnapshotUpdatedAt).toBe('string');
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
    expect(res.body.layoutSnapshotJson?.pages?.length).toBeGreaterThan(0);
    expect(res.body.layoutEngineVersion).toBe(2);

    const updated = await request(app)
      .get(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Chapter Alpha Revised');
    expect(updated.body.typstSource).toContain('Chapter Alpha Revised');
    expect(updated.body.layoutSnapshotJson?.metrics?.pageCount).toBeGreaterThan(0);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(JSON.stringify(project.content)).toContain('Chapter Alpha Revised');
  });

  it('accepts client-provided layout snapshots for the saved document revision', async () => {
    const nextProjection = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Alpha Revised' }] },
        { type: 'paragraph', attrs: { nodeId: 'paragraph-1' }, content: [{ type: 'text', text: 'Persist the saved page layout.' }] },
      ],
    };
    const clientSnapshot = buildLayoutDocumentV2({
      content: nextProjection,
      layoutPlan: null,
      preset: 'standard_pdf',
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Chapter Alpha Revised',
      measurementMode: 'deterministic',
      respectManualPageBreaks: true,
      generatedAt: new Date('2026-04-10T12:00:00.000Z'),
    });

    const res = await request(app)
      .patch(`/api/v1/projects/${projectId}/documents/${docId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        editorProjectionJson: nextProjection,
        layoutSnapshotJson: clientSnapshot,
      });

    expect(res.status).toBe(200);
    expect(res.body.layoutSnapshotJson?.preset).toBe('standard_pdf');
    expect(res.body.layoutSnapshotJson?.metrics?.fragmentCount).toBe(clientSnapshot.metrics.fragmentCount);
    expect(res.body.layoutEngineVersion).toBe(2);
    expect(res.body.layoutSnapshotUpdatedAt).toBeTruthy();

    const document = await prisma.projectDocument.findUniqueOrThrow({
      where: { id: docId },
      select: {
        layoutSnapshotJson: true,
        layoutEngineVersion: true,
      },
    });
    expect((document.layoutSnapshotJson as { preset?: string })?.preset).toBe('standard_pdf');
    expect(document.layoutEngineVersion).toBe(2);
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
    expect(updated.body.layoutSnapshotJson?.layoutPlan?.sectionRecipe).toBe('chapter_hero_split');
    expect(updated.body.layoutEngineVersion).toBe(2);

    const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(JSON.stringify(project.content)).toContain('Persist the saved page layout.');
  });
});
