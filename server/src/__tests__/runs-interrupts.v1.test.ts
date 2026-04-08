import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';
import { createRun } from '../services/generation/run.service.js';
import { createAgentRun } from '../services/agent/run.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `run-interrupt-v1-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;
let generationRunId: string;
let agentRunId: string;

function buildInterrupt(id: string, kind: string, title: string, status: 'pending' | 'approved' | 'edited' | 'rejected' = 'pending') {
  return {
    id,
    kind,
    title,
    summary: `${title} summary`,
    status,
    payload: { source: kind },
    createdAt: new Date().toISOString(),
    resolvedAt: status === 'pending' ? null : new Date().toISOString(),
  };
}

describe('Run Interrupt API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Interrupt Test User',
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
        title: 'Interrupt Route Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;

    const generationRun = await createRun({
      projectId,
      userId,
      prompt: 'Create an interruptible campaign',
      mode: 'campaign',
      quality: 'polished',
    });
    if (!generationRun) {
      throw new Error('Failed to create generation run fixture');
    }
    generationRunId = generationRun.id;

    const agentRun = await createAgentRun({
      projectId,
      userId,
      mode: 'persistent_editor',
      objective: 'Review pending approvals',
    });
    if (!agentRun) {
      throw new Error('Failed to create agent run fixture');
    }
    agentRunId = agentRun.id;

    await prisma.generationRun.update({
      where: { id: generationRunId },
      data: {
        status: 'paused',
        currentStage: 'planning',
        graphStateJson: {
          kind: 'generation',
          interrupts: [
            buildInterrupt(
              '11111111-1111-4111-8111-111111111111',
              'manual_review',
              'Review chapter outline',
            ),
          ],
        } as any,
      },
    });

    await prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: 'paused',
        currentStage: 'planning',
        graphStateJson: {
          kind: 'agent',
          interrupts: [
            buildInterrupt(
              '22222222-2222-4222-8222-222222222222',
              'approval_gate',
              'Approve creative director changes',
            ),
          ],
        } as any,
      },
    });
  });

  afterAll(async () => {
    await prisma.agentAction.deleteMany({ where: { run: { userId } } });
    await prisma.agentCheckpoint.deleteMany({ where: { run: { userId } } });
    await prisma.agentRun.deleteMany({ where: { userId } });
    await prisma.generationTask.deleteMany({ where: { run: { userId } } });
    await prisma.generationRun.deleteMany({ where: { userId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('lists pending project interrupts across generation and agent runs', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/interrupts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((interrupt: { runType: string }) => interrupt.runType).sort()).toEqual(['agent', 'generation']);
  });

  it('lists and resolves a generation run interrupt', async () => {
    const listRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${generationRunId}/interrupts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].status).toBe('pending');

    const resolveRes = await request(app)
      .post(`/api/v1/projects/${projectId}/generation-runs/${generationRunId}/interrupts/11111111-1111-4111-8111-111111111111/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ action: 'approve' });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe('approved');
    expect(resolveRes.body.runType).toBe('generation');

    const updatedRun = await prisma.generationRun.findUniqueOrThrow({ where: { id: generationRunId } });
    const updatedState = updatedRun.graphStateJson as Record<string, unknown>;
    const interrupts = updatedState.interrupts as Array<Record<string, unknown>>;
    expect(interrupts[0]?.status).toBe('approved');
    expect(interrupts[0]?.resolvedByUserId).toBe(userId);
    expect(updatedState.pendingInterruptCount).toBe(0);
    expect(updatedState.activeInterruptId).toBeNull();
  });

  it('lists and resolves an agent run interrupt with edit payload', async () => {
    const listRes = await request(app)
      .get(`/api/v1/projects/${projectId}/agent-runs/${agentRunId}/interrupts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].status).toBe('pending');

    const resolveRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agent-runs/${agentRunId}/interrupts/22222222-2222-4222-8222-222222222222/resolve`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        action: 'edit',
        payload: { note: 'Tighten encounter pacing before resuming.' },
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe('edited');
    expect(resolveRes.body.resolutionPayload).toMatchObject({
      note: 'Tighten encounter pacing before resuming.',
    });

    const updatedRun = await prisma.agentRun.findUniqueOrThrow({ where: { id: agentRunId } });
    const updatedState = updatedRun.graphStateJson as Record<string, unknown>;
    const interrupts = updatedState.interrupts as Array<Record<string, unknown>>;
    expect(interrupts[0]?.status).toBe('edited');
    expect(interrupts[0]?.resolutionPayload).toMatchObject({
      note: 'Tighten encounter pacing before resuming.',
    });
    expect(updatedState.pendingInterruptCount).toBe(0);
    expect(updatedState.activeInterruptId).toBeNull();
  });
});
