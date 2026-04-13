import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';
import { createRun } from '../services/generation/run.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `runs-v1-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;

describe('Run API v1 serialization', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Run V1 Test User',
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
        title: 'Run V1 Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates generation and agent runs with ISO timestamps', async () => {
    const generationRes = await request(app)
      .post(`/api/v1/projects/${projectId}/generation-runs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ prompt: 'Create a gothic mystery adventure.' });

    expect(generationRes.status).toBe(201);
    expect(generationRes.body.status).toBe('queued');
    expect(typeof generationRes.body.createdAt).toBe('string');
    expect(typeof generationRes.body.updatedAt).toBe('string');
    expect(generationRes.body.startedAt).toBeNull();
    expect(generationRes.body.completedAt).toBeNull();

    const cancelRes = await request(app)
      .post(`/api/v1/projects/${projectId}/generation-runs/${generationRes.body.id}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');
    expect(typeof cancelRes.body.completedAt).toBe('string');

    const agentRes = await request(app)
      .post(`/api/v1/projects/${projectId}/agent-runs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ objective: 'Review and polish the draft.' });

    expect(agentRes.status).toBe(201);
    expect(agentRes.body.status).toBe('queued');
    expect(typeof agentRes.body.createdAt).toBe('string');
    expect(typeof agentRes.body.updatedAt).toBe('string');

    const listAgentRunsRes = await request(app)
      .get(`/api/v1/projects/${projectId}/agent-runs`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listAgentRunsRes.status).toBe(200);
    expect(Array.isArray(listAgentRunsRes.body)).toBe(true);
    expect(listAgentRunsRes.body.some((run: { id: string }) => run.id === agentRes.body.id)).toBe(true);
    expect(typeof listAgentRunsRes.body[0].createdAt).toBe('string');
    expect(typeof listAgentRunsRes.body[0].updatedAt).toBe('string');
    expect(listAgentRunsRes.body[0].goal).toBeUndefined();
  });

  it('creates a generation run from a locked interview session and rejects unlocked sessions', async () => {
    const lockedBrief = {
      title: 'The Bell of Rust',
      summary: 'A short one-shot about a corroded cathedral bell that summons forgotten debts.',
      generationMode: 'one_shot',
      concept: "Stop a cursed bell from collecting the city's unpaid memories.",
      theme: 'Debt, memory, and corrosion',
      tone: 'Dark fantasy mystery',
      levelRange: { min: 3, max: 4 },
      scope: 'One-shot',
      partyAssumptions: 'A balanced party of four level 3-4 adventurers.',
      desiredComplexity: 'Medium',
      qualityBudgetLane: 'fast',
      mustHaveElements: ['Rust priests', 'Memory debtors'],
      specialConstraints: ['SRD-safe'],
      settings: {
        includeHandouts: true,
        includeMaps: false,
        strict5e: true,
      },
    } as const;

    const lockedSession = await prisma.interviewSession.create({
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

    const generationRes = await request(app)
      .post(`/api/v1/projects/${projectId}/generation-runs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ interviewSessionId: lockedSession.id });

    expect(generationRes.status).toBe(201);
    expect(generationRes.body.inputPrompt).toBe(lockedBrief.summary);
    expect(generationRes.body.agentStage).toBe('interview_locked');
    expect(generationRes.body.qualityBudgetLane).toBe('fast');
    expect(generationRes.body.inputParameters).toMatchObject({
      interviewSessionId: lockedSession.id,
      qualityBudgetLane: 'fast',
      autonomousFlowVersion: 'agentic_v1',
    });

    await prisma.interviewSession.deleteMany({
      where: { projectId, userId },
    });

    const unlockedSession = await prisma.interviewSession.create({
      data: {
        projectId,
        userId,
        status: 'collecting',
        turns: [],
        briefDraft: { title: 'Draft' } as any,
        maxUserTurns: 8,
      },
    });

    const rejectedRes = await request(app)
      .post(`/api/v1/projects/${projectId}/generation-runs`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ interviewSessionId: unlockedSession.id });

    expect(rejectedRes.status).toBe(409);
    expect(rejectedRes.body.error).toBe('Project not found or interview session is not locked.');
  });

  it('serializes generation run resources with ISO timestamps', async () => {
    const run = await createRun({
      projectId,
      userId,
      prompt: 'Build a serialization fixture adventure.',
      mode: 'campaign',
      quality: 'polished',
    });

    if (!run) {
      throw new Error('Failed to create generation run fixture');
    }

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run.id,
        projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'chapter-1',
        status: 'generated',
        version: 1,
        title: 'Chapter 1',
        summary: 'Opening chapter draft',
        jsonContent: { chapter: 1 },
        markdownContent: '# Chapter 1',
      },
    });

    await prisma.artifactEvaluation.create({
      data: {
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        evaluationType: 'publication_readiness',
        overallScore: 82,
        structuralCompleteness: 0.9,
        continuityScore: 0.8,
        dndSanity: 0.85,
        editorialQuality: 0.88,
        publicationFit: 0.81,
        passed: true,
        findings: [
          {
            severity: 'minor',
            code: 'OPENING_PACE',
            message: 'Opening pace could tighten slightly.',
            affectedScope: 'chapter-1',
            suggestedFix: 'Trim the boxed text by one paragraph.',
          },
        ],
        recommendedActions: ['tighten opening pacing'],
        evaluatorModel: 'gemini-2.5-flash',
        tokenCount: 1234,
      },
    });

    await prisma.canonEntity.create({
      data: {
        projectId,
        runId: run.id,
        entityType: 'npc',
        slug: 'ser-alric',
        canonicalName: 'Ser Alric',
        aliases: ['The Ashen Knight'],
        canonicalData: { role: 'mentor' },
        summary: 'A haunted knight tied to the manor.',
        sourceArtifactId: artifact.id,
      },
    });

    await prisma.assemblyManifest.create({
      data: {
        runId: run.id,
        projectId,
        version: 1,
        documents: [
          {
            documentSlug: 'chapter-1',
            title: 'Chapter 1',
            kind: 'chapter',
            artifactKeys: ['chapter-1'],
            sortOrder: 1,
          },
        ],
        status: 'draft',
      },
    });

    const listRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    const listedRun = listRes.body.find((candidate: { id: string }) => candidate.id === run.id);
    expect(listedRun).toBeTruthy();
    expect(typeof listedRun.createdAt).toBe('string');
    expect(typeof listedRun.updatedAt).toBe('string');

    const detailRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(detailRes.status).toBe(200);
    expect(typeof detailRes.body.createdAt).toBe('string');
    expect(typeof detailRes.body.updatedAt).toBe('string');

    const artifactsRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}/artifacts`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(artifactsRes.status).toBe(200);
    expect(typeof artifactsRes.body[0].createdAt).toBe('string');
    expect(typeof artifactsRes.body[0].updatedAt).toBe('string');

    const artifactDetailRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}/artifacts/${artifact.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(artifactDetailRes.status).toBe(200);
    expect(typeof artifactDetailRes.body.createdAt).toBe('string');
    expect(typeof artifactDetailRes.body.updatedAt).toBe('string');
    expect(typeof artifactDetailRes.body.evaluations[0].createdAt).toBe('string');

    const canonRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}/canon`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(canonRes.status).toBe(200);
    expect(typeof canonRes.body[0].createdAt).toBe('string');
    expect(typeof canonRes.body[0].updatedAt).toBe('string');

    const evaluationsRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}/evaluations`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(evaluationsRes.status).toBe(200);
    expect(typeof evaluationsRes.body[0].createdAt).toBe('string');

    const assemblyRes = await request(app)
      .get(`/api/v1/projects/${projectId}/generation-runs/${run.id}/assembly`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(assemblyRes.status).toBe(200);
    expect(typeof assemblyRes.body.createdAt).toBe('string');
    expect(typeof assemblyRes.body.updatedAt).toBe('string');
  }, 15000);
});
