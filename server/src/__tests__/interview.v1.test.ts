import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../index.js';
import { prisma } from '../config/database.js';

const mockGenerateObjectWithTimeout = vi.hoisted(() => vi.fn());
const mockResolveSystemAgentLanguageModel = vi.hoisted(() => vi.fn());

vi.mock('../services/generation/model-timeouts.js', () => ({
  generateObjectWithTimeout: mockGenerateObjectWithTimeout,
}));

vi.mock('../services/llm/system-router.js', () => ({
  resolveSystemAgentLanguageModel: mockResolveSystemAgentLanguageModel,
}));

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const uniqueSuffix = Date.now();
const TEST_EMAIL = `interview-v1-${uniqueSuffix}@example.com`;

let accessToken: string;
let userId: string;
let projectId: string;

const INITIAL_BRIEF = {
  title: 'The Clockwork Hollow',
  summary: 'A short adventure about a haunted automaton workshop.',
  generationMode: 'one_shot',
  concept: 'Investigate a vanished inventor and his unstable workshop.',
  theme: 'clockwork mystery',
  tone: 'tense but adventurous',
  levelRange: { min: 3, max: 5 },
  scope: 'compact one-shot',
  partyAssumptions: 'A standard four-character party with one healer and one frontliner.',
  desiredComplexity: 'balanced',
  qualityBudgetLane: 'balanced',
  mustHaveElements: ['a workshop puzzle', 'one memorable NPC'],
  specialConstraints: ['Keep the story to a single evening of play.'],
  settings: {
    includeHandouts: true,
    includeMaps: true,
    strict5e: true,
  },
};

const READY_BRIEF = {
  ...INITIAL_BRIEF,
  summary: 'The inventor vanished inside a haunted clockwork workshop.',
};

function mockInterviewStep(assistantMessage: string, readyToLock: boolean, brief = READY_BRIEF) {
  mockGenerateObjectWithTimeout.mockResolvedValueOnce({
    object: {
      assistantMessage,
      readyToLock,
      brief,
      missingFields: readyToLock ? [] : ['scope'],
    },
  } as any);
}

describe('Interview API v1', () => {
  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('StrongP@ss1', 4);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        displayName: 'Interview V1 Test User',
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
        title: 'Interview V1 Project',
        type: 'campaign',
        userId: user.id,
      },
    });
    projectId = project.id;

    mockResolveSystemAgentLanguageModel.mockResolvedValue({
      model: {} as any,
      maxOutputTokens: 4096,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSystemAgentLanguageModel.mockResolvedValue({
      model: {} as any,
      maxOutputTokens: 4096,
    });
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates, appends to, and locks an interview session', async () => {
    mockInterviewStep('What tone should the workshop have?', false);

    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ initialPrompt: 'I want a mysterious clockwork adventure.' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('collecting');
    expect(createRes.body.turns).toHaveLength(2);
    expect(createRes.body.briefDraft.summary).toBe(READY_BRIEF.summary);

    mockInterviewStep('What is the desired ending?', true, {
      ...READY_BRIEF,
      summary: 'The inventor vanished inside a haunted clockwork workshop.',
      specialConstraints: ['Keep the story to a single evening of play.'],
    });

    const appendRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions/${createRes.body.id}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Make it a one-shot with a creepy mystery.' });

    expect(appendRes.status).toBe(200);
    expect(appendRes.body.status).toBe('ready_to_lock');
    expect(appendRes.body.turns).toHaveLength(4);
    expect(appendRes.body.turns[2].role).toBe('user');
    expect(appendRes.body.turns[3].role).toBe('assistant');

    const getRes = await request(app)
      .get(`/api/v1/projects/${projectId}/interview/sessions/${createRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(createRes.body.id);
    expect(getRes.body.status).toBe('ready_to_lock');

    const lockRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions/${createRes.body.id}/lock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.status).toBe('locked');
    expect(lockRes.body.lockedBrief.summary).toBe(READY_BRIEF.summary);
    expect(typeof lockRes.body.lockedAt).toBe('string');

    const afterLockRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions/${createRes.body.id}/messages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: 'Should not be accepted.' });

    expect(afterLockRes.status).toBe(409);
    expect(afterLockRes.body.error).toContain('already locked');
  });

  it('falls back to a seeded interview brief when the interviewer model is overloaded on create', async () => {
    const overloadedError = new Error(
      'Failed after 3 attempts. Last error: This model is currently experiencing high demand. Please try again later.',
    );
    overloadedError.name = 'AI_RetryError';
    mockGenerateObjectWithTimeout.mockRejectedValueOnce(overloadedError);

    const res = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        initialPrompt: 'Create a polished one-shot for levels 4-5 about a haunted clockwork conservatory with one memorable NPC and a puzzle lock.',
      });

    expect(res.status).toBe(201);
    expect(res.body.briefDraft).toBeTruthy();
    expect(res.body.briefDraft.generationMode).toBe('one_shot');
    expect(res.body.briefDraft.qualityBudgetLane).toBe('high_quality');
    expect(res.body.briefDraft.levelRange).toEqual({ min: 4, max: 5 });
    expect(res.body.turns).toHaveLength(2);
    expect(res.body.turns[1].content).toContain('seeded');
  });

  it('locks with the seeded brief when force-lock hits a transient interviewer overload', async () => {
    const overloadedError = new Error(
      'Failed after 3 attempts. Last error: This model is currently experiencing high demand. Please try again later.',
    );
    overloadedError.name = 'AI_RetryError';
    mockGenerateObjectWithTimeout.mockRejectedValueOnce(overloadedError);
    mockGenerateObjectWithTimeout.mockRejectedValueOnce(overloadedError);

    const createRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        initialPrompt: 'Build a balanced short module for levels 6-7 with wilderness travel, maps, and three set-piece encounters.',
      });

    expect(createRes.status).toBe(201);

    const lockRes = await request(app)
      .post(`/api/v1/projects/${projectId}/interview/sessions/${createRes.body.id}/lock`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ force: true });

    expect(lockRes.status).toBe(200);
    expect(lockRes.body.status).toBe('locked');
    expect(lockRes.body.lockedBrief).toBeTruthy();
    expect(lockRes.body.lockedBrief.generationMode).toBe('module');
    expect(lockRes.body.lockedBrief.levelRange).toEqual({ min: 6, max: 7 });
  });

  it('returns 404 when a session does not belong to the project or user', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${projectId}/interview/sessions/00000000-0000-0000-0000-000000000000`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Interview session not found');
  });
});
