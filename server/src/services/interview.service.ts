import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type {
  InterviewBrief,
  InterviewSession,
  InterviewTurn,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { generateObjectWithTimeout } from './generation/model-timeouts.js';
import { resolveSystemAgentLanguageModel } from './llm/system-router.js';

const MAX_USER_TURNS = 8;

const InterviewBriefSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000),
  generationMode: z.enum(['one_shot', 'module']),
  concept: z.string().min(1).max(4000),
  theme: z.string().min(1).max(500),
  tone: z.string().min(1).max(500),
  levelRange: z.object({
    min: z.number().int().min(1).max(20),
    max: z.number().int().min(1).max(20),
  }).nullable(),
  scope: z.string().min(1).max(500),
  partyAssumptions: z.string().min(1).max(2000),
  desiredComplexity: z.string().min(1).max(500),
  qualityBudgetLane: z.enum(['fast', 'balanced', 'high_quality']),
  mustHaveElements: z.array(z.string().min(1).max(500)).max(20),
  specialConstraints: z.array(z.string().min(1).max(500)).max(20),
  settings: z.object({
    includeHandouts: z.boolean(),
    includeMaps: z.boolean(),
    strict5e: z.boolean(),
  }),
});

const InterviewAgentResponseSchema = z.object({
  assistantMessage: z.string().min(1).max(4000),
  readyToLock: z.boolean(),
  brief: InterviewBriefSchema,
  missingFields: z.array(z.string().min(1).max(100)).max(8),
});

type InterviewAgentResponse = z.infer<typeof InterviewAgentResponseSchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseInterviewBrief(value: unknown): InterviewBrief | null {
  const parsed = InterviewBriefSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseInterviewTurns(value: unknown): InterviewTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((turn) => {
      const record = asRecord(turn);
      if (!record) return null;
      if ((record.role !== 'assistant' && record.role !== 'user') || typeof record.content !== 'string') {
        return null;
      }
      return {
        id: typeof record.id === 'string' ? record.id : randomUUID(),
        role: record.role,
        content: record.content,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      } satisfies InterviewTurn;
    })
    .filter((turn): turn is InterviewTurn => Boolean(turn));
}

function serializeSession(session: {
  id: string;
  projectId: string;
  userId: string;
  status: string;
  turns: unknown;
  briefDraft: unknown;
  lockedBrief: unknown;
  maxUserTurns: number;
  createdAt: Date;
  updatedAt: Date;
  lockedAt: Date | null;
}): InterviewSession {
  return {
    id: session.id,
    projectId: session.projectId,
    userId: session.userId,
    status: session.status as InterviewSession['status'],
    turns: parseInterviewTurns(session.turns),
    briefDraft: parseInterviewBrief(session.briefDraft),
    lockedBrief: parseInterviewBrief(session.lockedBrief),
    maxUserTurns: session.maxUserTurns,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lockedAt: session.lockedAt?.toISOString() ?? null,
  };
}

function buildTranscript(turns: InterviewTurn[]) {
  if (turns.length === 0) return 'No messages yet.';
  return turns.map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`).join('\n');
}

function buildInterviewSystemPrompt() {
  return `You are the interviewer agent for a D&D publishing pipeline.

Your job is to gather exactly enough information to create a high-quality structured brief for an autonomous generation system.

Rules:
- Ask one high-value follow-up question at a time.
- Prefer practical publishing questions over vague brainstorming.
- The supported generation modes are only one_shot and module.
- You must ask or infer a quality budget lane: fast, balanced, or high_quality.
- Keep the assistantMessage short and direct.
- When the brief is good enough to start autonomous generation, set readyToLock=true.
- Always return a full normalized brief object, even before the interview is complete.
- If the user asks for a long campaign/sourcebook, compress it into the closest supported short-module interpretation and note that in summary/specialConstraints.`;
}

function buildInterviewPrompt(input: {
  initialPrompt?: string | null;
  turns: InterviewTurn[];
  existingBrief: InterviewBrief | null;
  maxUserTurns: number;
}) {
  const userTurnCount = input.turns.filter((turn) => turn.role === 'user').length;
  return [
    input.initialPrompt ? `Initial request:\n${input.initialPrompt}\n` : '',
    `Current transcript:\n${buildTranscript(input.turns)}\n`,
    `Existing brief draft:\n${JSON.stringify(input.existingBrief ?? null, null, 2)}\n`,
    `User turns so far: ${userTurnCount}/${input.maxUserTurns}\n`,
    'Collect these fields: concept, theme, tone, level range, scope, party assumptions, desired complexity, budget lane, must-have elements, and special constraints.',
    'If the transcript already supports a credible brief, do not ask filler questions.',
  ].join('\n');
}

async function generateInterviewStep(input: {
  initialPrompt?: string | null;
  turns: InterviewTurn[];
  existingBrief: InterviewBrief | null;
  maxUserTurns: number;
}) {
  const { model, maxOutputTokens } = await resolveSystemAgentLanguageModel('agent.interviewer', 'balanced');
  const { object } = await generateObjectWithTimeout('Interview step generation', {
    model,
    system: buildInterviewSystemPrompt(),
    prompt: buildInterviewPrompt(input),
    schema: InterviewAgentResponseSchema,
    maxOutputTokens: Math.min(maxOutputTokens, 4096),
  });

  return InterviewAgentResponseSchema.parse(object) as InterviewAgentResponse;
}

async function getSessionRecord(projectId: string, userId: string) {
  return prisma.interviewSession.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function getInterviewSession(projectId: string, userId: string) {
  const session = await getSessionRecord(projectId, userId);
  return session ? serializeSession(session) : null;
}

export async function createInterviewSession(
  projectId: string,
  userId: string,
  initialPrompt?: string,
) {
  let turns: InterviewTurn[] = [];

  if (initialPrompt?.trim()) {
    turns.push({
      id: randomUUID(),
      role: 'user',
      content: initialPrompt.trim(),
      createdAt: new Date().toISOString(),
    });
  }

  const step = await generateInterviewStep({
    initialPrompt: initialPrompt?.trim() || null,
    turns,
    existingBrief: null,
    maxUserTurns: MAX_USER_TURNS,
  });

  turns = [
    ...turns,
    {
      id: randomUUID(),
      role: 'assistant',
      content: step.assistantMessage,
      createdAt: new Date().toISOString(),
    },
  ];

  const session = await prisma.interviewSession.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      status: step.readyToLock ? 'ready_to_lock' : 'collecting',
      turns: turns as any,
      briefDraft: step.brief as any,
      maxUserTurns: MAX_USER_TURNS,
    },
    update: {
      status: step.readyToLock ? 'ready_to_lock' : 'collecting',
      turns: turns as any,
      briefDraft: step.brief as any,
      lockedBrief: Prisma.JsonNull,
      lockedAt: null,
      maxUserTurns: MAX_USER_TURNS,
    },
  });

  return serializeSession(session);
}

export async function appendInterviewMessage(
  projectId: string,
  userId: string,
  sessionId: string,
  content: string,
) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, projectId, userId },
  });
  if (!session) return null;
  if (session.status === 'locked') {
    throw new Error('Interview session is already locked.');
  }

  const nextTurns = parseInterviewTurns(session.turns);
  nextTurns.push({
    id: randomUUID(),
    role: 'user',
    content: content.trim(),
    createdAt: new Date().toISOString(),
  });

  const userTurnCount = nextTurns.filter((turn) => turn.role === 'user').length;
  const step = await generateInterviewStep({
    turns: nextTurns,
    existingBrief: parseInterviewBrief(session.briefDraft),
    maxUserTurns: session.maxUserTurns,
  });

  nextTurns.push({
    id: randomUUID(),
    role: 'assistant',
    content: step.assistantMessage,
    createdAt: new Date().toISOString(),
  });

  const updated = await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      status: step.readyToLock || userTurnCount >= session.maxUserTurns ? 'ready_to_lock' : 'collecting',
      turns: nextTurns as any,
      briefDraft: step.brief as any,
    },
  });

  return serializeSession(updated);
}

export async function lockInterviewSession(
  projectId: string,
  userId: string,
  sessionId: string,
  force = false,
) {
  const session = await prisma.interviewSession.findFirst({
    where: { id: sessionId, projectId, userId },
  });
  if (!session) return null;

  if (session.status === 'locked') {
    return serializeSession(session);
  }

  const turns = parseInterviewTurns(session.turns);
  let brief = parseInterviewBrief(session.briefDraft);

  if (!brief || force) {
    const step = await generateInterviewStep({
      turns,
      existingBrief: brief,
      maxUserTurns: session.maxUserTurns,
    });
    brief = step.brief;
  }

  if (!brief) {
    throw new Error('Interview brief is incomplete.');
  }

  const updated = await prisma.interviewSession.update({
    where: { id: session.id },
    data: {
      status: 'locked',
      briefDraft: brief as any,
      lockedBrief: brief as any,
      lockedAt: new Date(),
    },
  });

  return serializeSession(updated);
}
