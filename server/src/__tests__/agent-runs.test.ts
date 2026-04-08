import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';
import { createAgentCheckpoint } from '../services/agent/checkpoint.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `agent-test-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;
let runId: string;
let docId: string;

describe('Agent Run Routes', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Agent Test User',
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
        title: 'Agent Test Project',
        type: 'one_shot',
        userId: user.id,
      },
    });
    projectId = project.id;

    const document = await prisma.projectDocument.create({
      data: {
        projectId,
        kind: 'chapter',
        title: 'Chapter 1: Arrival',
        slug: 'chapter-1-arrival',
        sortOrder: 0,
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { nodeId: 'para-1' },
              content: [{ type: 'text', text: 'Original content.' }],
            },
          ],
        },
      },
    });
    docId = document.id;
  });

  afterAll(async () => {
    await prisma.agentDecision.deleteMany({ where: { run: { userId } } });
    await prisma.agentObservation.deleteMany({ where: { run: { userId } } });
    await prisma.agentAction.deleteMany({ where: { run: { userId } } });
    await prisma.agentCheckpoint.deleteMany({ where: { run: { userId } } });
    await prisma.agentRun.deleteMany({ where: { userId } });
    await prisma.projectDocument.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates and lists a persistent editor agent run', async () => {
    const createRes = await request(app)
      .post(`/api/projects/${projectId}/ai/agent-runs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'persistent_editor',
        objective: 'Improve the current project for DM usability.',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.mode).toBe('persistent_editor');
    runId = createRes.body.id;

    const listRes = await request(app)
      .get(`/api/projects/${projectId}/ai/agent-runs`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body[0].id).toBe(runId);
  });

  it('lists checkpoints and restores a checkpoint snapshot', async () => {
    const checkpoint = await createAgentCheckpoint({
      runId,
      projectId,
      label: 'Initial snapshot',
      summary: 'Before the agent edits anything.',
      cycleIndex: 0,
      isBest: true,
    });

    await prisma.projectDocument.update({
      where: { id: docId },
      data: {
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: { nodeId: 'para-1' },
              content: [{ type: 'text', text: 'Mutated content.' }],
            },
          ],
        },
      },
    });

    const listRes = await request(app)
      .get(`/api/projects/${projectId}/ai/agent-runs/${runId}/checkpoints`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body[0].id).toBe(checkpoint.id);

    const restoreRes = await request(app)
      .post(`/api/projects/${projectId}/ai/agent-runs/${runId}/checkpoints/${checkpoint.id}/restore`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.id).toBe(checkpoint.id);

    const restoredDoc = await prisma.projectDocument.findUniqueOrThrow({ where: { id: docId } });
    expect(JSON.stringify(restoredDoc.content)).toContain('Original content.');
    expect(JSON.stringify(restoredDoc.canonicalDocJson)).toContain('Original content.');
    expect(JSON.stringify(restoredDoc.editorProjectionJson)).toContain('Original content.');
    expect(restoredDoc.typstSource).toContain('Original content.');
  });
});
