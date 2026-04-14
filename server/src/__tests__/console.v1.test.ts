import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';
import { createRun } from '../services/generation/run.service.js';

const mockGenerateTextWithTimeout = vi.hoisted(() => vi.fn());
const mockResolveSystemAgentLanguageModel = vi.hoisted(() => vi.fn());

vi.mock('../services/generation/model-timeouts.js', () => ({
  generateTextWithTimeout: mockGenerateTextWithTimeout,
}));

vi.mock('../services/llm/system-router.js', () => ({
  resolveSystemAgentLanguageModel: mockResolveSystemAgentLanguageModel,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `console-v1-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;

describe('Console API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Console V1 Test User',
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
        title: 'Console V1 Project',
        description: 'A short module for the forge console.',
        type: 'one_shot',
        userId: user.id,
      },
    });
    projectId = project.id;

    mockResolveSystemAgentLanguageModel.mockResolvedValue({
      model: {} as any,
      maxOutputTokens: 4096,
    });
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockResolveSystemAgentLanguageModel.mockResolvedValue({
      model: {} as any,
      maxOutputTokens: 4096,
    });
    mockGenerateTextWithTimeout.mockResolvedValue({
      text: 'The hall is aligned. I am routing the next specialist now.',
    });
    await prisma.generatedArtifact.deleteMany({ where: { projectId } });
    await prisma.exportJob.deleteMany({ where: { projectId } });
    await prisma.generationRun.deleteMany({ where: { projectId } });
    await prisma.interviewSession.deleteMany({ where: { projectId } });
  });

  afterAll(async () => {
    await prisma.generatedArtifact.deleteMany({ where: { projectId } });
    await prisma.exportJob.deleteMany({ where: { projectId } });
    await prisma.generationRun.deleteMany({ where: { projectId } });
    await prisma.interviewSession.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('lists the forge console agents for the latest autonomous run', async () => {
    const lockedBrief = {
      title: 'The Brass Verdict',
      summary: 'A one-shot about a haunted courtroom clock.',
      generationMode: 'one_shot',
      concept: 'Stop a court of ghosts from rewriting time.',
      theme: 'clockwork justice',
      tone: 'tense mystery',
      levelRange: { min: 4, max: 5 },
      scope: 'one-shot',
      partyAssumptions: 'Four level 4-5 adventurers.',
      desiredComplexity: 'balanced',
      qualityBudgetLane: 'balanced',
      mustHaveElements: ['ghost judge'],
      specialConstraints: ['SRD-safe'],
      settings: {
        includeHandouts: true,
        includeMaps: true,
        strict5e: true,
      },
    } as const;

    await prisma.interviewSession.create({
      data: {
        projectId,
        userId,
        status: 'locked',
        turns: [],
        briefDraft: lockedBrief as any,
        lockedBrief: lockedBrief as any,
        maxUserTurns: 8,
        lockedAt: new Date(),
      },
    });

    const run = await createRun({
      projectId,
      userId,
      interviewSessionId: (
        await prisma.interviewSession.findFirstOrThrow({
          where: { projectId, userId },
          select: { id: true },
        })
      ).id,
    });

    if (!run) {
      throw new Error('Failed to create console run fixture');
    }

    await prisma.generationRun.update({
      where: { id: run.id },
      data: {
        status: 'generating_prose',
        currentStage: 'writer_story_packet',
        progressPercent: 34,
        graphStateJson: {
          ...(run.graphStateJson ?? {}),
          agentStage: 'writer_story_packet',
          criticCycle: 1,
          qualityBudgetLane: 'balanced',
          imageGenerationStatus: 'requested',
          finalEditorialStatus: 'pending',
        } as any,
      },
    });

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/console/agents`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((agent: { id: string }) => agent.id === 'forgemaster')).toBe(true);
    expect(res.body.some((agent: { id: string; status: string }) => agent.id === 'writer' && agent.status === 'working')).toBe(true);
    expect(res.body.some((agent: { id: string; status: string }) => agent.id === 'critic' && agent.status === 'waiting')).toBe(true);
  });

  it('sends single-agent and broadcast console chat replies', async () => {
    const singleRes = await request(app)
      .post(`/api/v1/projects/${projectId}/console/chat`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'forgemaster',
        message: 'What is the hall doing right now?',
      });

    expect(singleRes.status).toBe(200);
    expect(singleRes.body.replies).toHaveLength(1);
    expect(singleRes.body.replies[0].fromAgentId).toBe('forgemaster');
    expect(singleRes.body.replies[0].responseMode).toBe('model');
    expect(mockGenerateTextWithTimeout).toHaveBeenCalledTimes(1);

    mockGenerateTextWithTimeout.mockResolvedValue({
      text: 'I have my answer ready.',
    });

    const broadcastRes = await request(app)
      .post(`/api/v1/projects/${projectId}/console/chat`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'broadcast',
        message: 'Hall, report status.',
      });

    expect(broadcastRes.status).toBe(200);
    expect(Array.isArray(broadcastRes.body.replies)).toBe(true);
    expect(broadcastRes.body.replies.length).toBeGreaterThan(1);
    expect(broadcastRes.body.replies.every((reply: { responseMode: string }) => reply.responseMode === 'model')).toBe(true);
  });

  it('marks fallback console replies explicitly', async () => {
    const overloadedError = new Error(
      'Failed after 3 attempts. Last error: This model is currently experiencing high demand. Please try again later.',
    );
    overloadedError.name = 'AI_RetryError';
    mockGenerateTextWithTimeout.mockRejectedValueOnce(overloadedError);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/console/chat`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'writer',
        message: 'Status?',
      });

    expect(res.status).toBe(200);
    expect(res.body.replies).toHaveLength(1);
    expect(res.body.replies[0].fromAgentId).toBe('writer');
    expect(res.body.replies[0].responseMode).toBe('fallback');
  });

  it('returns 400 for an unknown console agent', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/console/chat`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        agentId: 'unknown-agent',
        message: 'Hello?',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown console agent.');
  });
});
