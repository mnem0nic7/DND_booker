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
const DEFAULT_PARTY_ASSUMPTIONS = 'A standard four-character adventuring party with balanced combat, exploration, and social capabilities.';

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

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function titleCaseFromPhrase(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function collectUserRequestText(input: {
  initialPrompt?: string | null;
  turns: InterviewTurn[];
}) {
  const userTurns = input.turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => collapseWhitespace(turn.content))
    .filter(Boolean);

  const seeded = collapseWhitespace(input.initialPrompt ?? '');
  return [seeded, ...userTurns].filter(Boolean).join('\n\n').trim();
}

function inferGenerationMode(text: string, existingBrief: InterviewBrief | null): InterviewBrief['generationMode'] {
  if (existingBrief?.generationMode) return existingBrief.generationMode;
  if (/\bone[\s-]?shot\b|\bsingle session\b|\bone evening\b/i.test(text)) {
    return 'one_shot';
  }
  if (/\bmodule\b|\bshort adventure\b|\bmini campaign\b|\bchapter\b/i.test(text)) {
    return 'module';
  }
  return 'one_shot';
}

function inferQualityBudgetLane(text: string, existingBrief: InterviewBrief | null): InterviewBrief['qualityBudgetLane'] {
  if (existingBrief?.qualityBudgetLane) return existingBrief.qualityBudgetLane;
  if (/\bhigh[_ -]?quality\b|\bpolished\b|\bpremium\b/i.test(text)) return 'high_quality';
  if (/\bfast\b|\bquick\b|\blow cost\b/i.test(text)) return 'fast';
  return 'balanced';
}

function inferTone(text: string, existingBrief: InterviewBrief | null) {
  if (existingBrief?.tone) return existingBrief.tone;
  if (/\bhorror\b|\bcreepy\b|\bdread\b|\bgrim\b|\bdark\b/i.test(text)) return 'dark fantasy suspense';
  if (/\bcomedy\b|\bfunny\b|\bwhimsical\b|\blighthearted\b/i.test(text)) return 'lighthearted adventure';
  if (/\bintrigue\b|\bpolitic/i.test(text)) return 'tense political intrigue';
  if (/\bmystery\b|\binvestigation\b/i.test(text)) return 'mysterious and investigative';
  return 'heroic fantasy adventure';
}

function inferTheme(text: string, existingBrief: InterviewBrief | null) {
  if (existingBrief?.theme) return existingBrief.theme;
  if (/\bunderdark\b/i.test(text)) return 'underdark survival and intrigue';
  if (/\bclockwork\b|\bautomaton\b|\bworkshop\b/i.test(text)) return 'clockwork mystery';
  if (/\bwilderness\b|\bforest\b|\bjungle\b|\btravel\b/i.test(text)) return 'wilderness exploration';
  if (/\bdungeon\b|\bmegadungeon\b|\bdelve\b/i.test(text)) return 'dungeon exploration';
  if (/\bcity\b|\burban\b/i.test(text)) return 'urban intrigue';
  return 'original D&D-compatible fantasy adventure';
}

function inferDesiredComplexity(text: string, existingBrief: InterviewBrief | null) {
  if (existingBrief?.desiredComplexity) return existingBrief.desiredComplexity;
  if (/\bcomplex\b|\badvanced\b|\bexperienced players\b/i.test(text)) return 'high';
  if (/\bsimple\b|\bbeginner\b|\bstraightforward\b/i.test(text)) return 'light';
  return 'balanced';
}

function inferLevelRange(text: string, existingBrief: InterviewBrief | null): InterviewBrief['levelRange'] {
  if (existingBrief?.levelRange) return existingBrief.levelRange;

  const rangeMatch = text.match(/\blevels?\s*(\d{1,2})\s*(?:-|to|through)\s*(\d{1,2})\b/i)
    ?? text.match(/\bfor levels?\s*(\d{1,2})\s*(?:-|to|through)\s*(\d{1,2})\b/i);
  if (rangeMatch) {
    const min = Number.parseInt(rangeMatch[1]!, 10);
    const max = Number.parseInt(rangeMatch[2]!, 10);
    if (Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max <= 20 && min <= max) {
      return { min, max };
    }
  }

  const singleMatch = text.match(/\blevel\s*(\d{1,2})\b/i)
    ?? text.match(/\b(?:for|at)\s*(\d{1,2})(?:st|nd|rd|th)\s*level\b/i);
  if (singleMatch) {
    const level = Number.parseInt(singleMatch[1]!, 10);
    if (Number.isFinite(level) && level >= 1 && level <= 20) {
      return { min: level, max: level };
    }
  }

  return null;
}

function inferScope(
  text: string,
  generationMode: InterviewBrief['generationMode'],
  existingBrief: InterviewBrief | null,
) {
  if (existingBrief?.scope) return existingBrief.scope;
  if (/8\s*-\s*12\s*pages?|short one-shot|single session/i.test(text)) return 'compact one-shot';
  if (/20\s*-\s*40\s*pages?|short module|two chapters|three chapters/i.test(text)) return 'short module';
  return generationMode === 'module' ? 'short module' : 'compact one-shot';
}

function inferPartyAssumptions(text: string, existingBrief: InterviewBrief | null) {
  if (existingBrief?.partyAssumptions) return existingBrief.partyAssumptions;
  const explicit = text.match(/\bparty assumptions?:?\s*(.+)$/im)?.[1]?.trim();
  return explicit ? truncate(explicit, 2000) : DEFAULT_PARTY_ASSUMPTIONS;
}

function inferSettings(text: string, existingBrief: InterviewBrief | null): InterviewBrief['settings'] {
  if (existingBrief?.settings) return existingBrief.settings;
  const lowercase = text.toLowerCase();
  return {
    includeHandouts: !/\bno handouts?\b/.test(lowercase),
    includeMaps: !/\bno maps?\b/.test(lowercase),
    strict5e: !/\b5\.5e\b|\b2024 rules\b|\bhomebrew rules\b/.test(lowercase),
  };
}

function extractTaggedItems(text: string, patterns: RegExp[]) {
  const items = new Set<string>();

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      raw
        .split(/\s*(?:,|;|\band\b)\s*/i)
        .map((part) => collapseWhitespace(part))
        .filter(Boolean)
        .forEach((part) => items.add(truncate(part, 500)));
    }
  }

  return Array.from(items).slice(0, 20);
}

function inferMustHaveElements(text: string, existingBrief: InterviewBrief | null) {
  if (existingBrief?.mustHaveElements?.length) return existingBrief.mustHaveElements;
  const inferred = extractTaggedItems(text, [
    /\bmust[- ]have(?: elements?)?:?\s*(.+)$/gim,
    /\binclude(?: at least)?\s+(.+)$/gim,
  ]);
  return inferred;
}

function inferSpecialConstraints(text: string, existingBrief: InterviewBrief | null, generationMode: InterviewBrief['generationMode']) {
  const seeded = new Set(existingBrief?.specialConstraints ?? []);

  extractTaggedItems(text, [
    /\bconstraint(?:s)?:?\s*(.+)$/gim,
    /\bavoid(?:ing)?\s+(.+)$/gim,
    /\bno\s+(.+)$/gim,
  ]).forEach((item) => seeded.add(item));

  if (/\bcampaign\b|\bsourcebook\b/i.test(text)) {
    seeded.add('Compress the requested scope into a one-shot or short module for the current autonomous pipeline.');
  }

  if (generationMode === 'one_shot' && !Array.from(seeded).some((item) => /single session|one evening/i.test(item))) {
    seeded.add('Target a single session or one evening of play.');
  }

  return Array.from(seeded).slice(0, 20);
}

function inferSummary(text: string, existingBrief: InterviewBrief | null, generationMode: InterviewBrief['generationMode']) {
  if (existingBrief?.summary) return existingBrief.summary;
  if (!text) {
    return generationMode === 'module'
      ? 'Create a short D&D-compatible adventure module.'
      : 'Create a compact D&D-compatible one-shot adventure.';
  }
  return truncate(collapseWhitespace(text), 4000);
}

function inferTitle(text: string, existingBrief: InterviewBrief | null, theme: string) {
  if (existingBrief?.title) return existingBrief.title;

  const explicit = text.match(/\btitle:?["“]?([^"\n”]+)["”]?/i)?.[1]?.trim();
  if (explicit) return truncate(explicit, 200);

  const aboutMatch = text.match(/\babout\s+([^.!\n]+)/i)?.[1];
  if (aboutMatch) {
    return truncate(titleCaseFromPhrase(collapseWhitespace(aboutMatch)), 200);
  }

  return truncate(titleCaseFromPhrase(theme || 'Adventure Brief'), 200);
}

function inferConcept(text: string, existingBrief: InterviewBrief | null, summary: string) {
  if (existingBrief?.concept) return existingBrief.concept;
  return truncate(text || summary, 4000);
}

function detectMissingFields(text: string, brief: InterviewBrief) {
  const missing: string[] = [];
  if (!text) {
    return ['concept', 'tone', 'scope', 'must-have elements'];
  }

  if (!/\bone[\s-]?shot\b|\bmodule\b|\bshort adventure\b|\bchapter\b/i.test(text)) {
    missing.push('scope');
  }
  if (!/\bgrim\b|\bdark\b|\bhorror\b|\blighthearted\b|\bheroic\b|\bmystery\b|\bintrigue\b|\bcomedy\b|\btone\b/i.test(text)) {
    missing.push('tone');
  }
  if (!/\blevel\b|\blevels\b|\btier\b/i.test(text) && !brief.levelRange) {
    missing.push('level range');
  }
  if (!/\bparty\b|\bcharacters\b|\bplayers\b/i.test(text)) {
    missing.push('party assumptions');
  }
  if (!/\bmust[- ]have\b|\binclude\b|\bconstraint\b|\bavoid\b/i.test(text)
    && brief.mustHaveElements.length === 0
    && brief.specialConstraints.length === 0) {
    missing.push('must-have elements');
  }
  if (!/\bfast\b|\bquick\b|\bbalanced\b|\bhigh[_ -]?quality\b|\bpolished\b/i.test(text)) {
    missing.push('quality budget lane');
  }

  return missing.slice(0, 8);
}

function buildFallbackInterviewStep(input: {
  initialPrompt?: string | null;
  turns: InterviewTurn[];
  existingBrief: InterviewBrief | null;
  maxUserTurns: number;
}): InterviewAgentResponse | null {
  const requestText = collectUserRequestText(input);
  if (!requestText && !input.existingBrief) {
    return null;
  }

  const generationMode = inferGenerationMode(requestText, input.existingBrief);
  const summary = inferSummary(requestText, input.existingBrief, generationMode);
  const theme = inferTheme(requestText, input.existingBrief);
  const brief: InterviewBrief = {
    title: inferTitle(requestText, input.existingBrief, theme),
    summary,
    generationMode,
    concept: inferConcept(requestText, input.existingBrief, summary),
    theme,
    tone: inferTone(requestText, input.existingBrief),
    levelRange: inferLevelRange(requestText, input.existingBrief),
    scope: inferScope(requestText, generationMode, input.existingBrief),
    partyAssumptions: inferPartyAssumptions(requestText, input.existingBrief),
    desiredComplexity: inferDesiredComplexity(requestText, input.existingBrief),
    qualityBudgetLane: inferQualityBudgetLane(requestText, input.existingBrief),
    mustHaveElements: inferMustHaveElements(requestText, input.existingBrief),
    specialConstraints: inferSpecialConstraints(requestText, input.existingBrief, generationMode),
    settings: inferSettings(requestText, input.existingBrief),
  };

  const userTurnCount = input.turns.filter((turn) => turn.role === 'user').length;
  const missingFields = detectMissingFields(requestText, brief);
  const readyToLock = requestText.length >= 180
    || missingFields.length <= 1
    || userTurnCount >= Math.min(2, input.maxUserTurns);

  const nextQuestion = missingFields[0];
  return {
    assistantMessage: readyToLock
      ? 'I seeded a production-ready brief from your request. You can lock it now or add any final must-have encounters, NPCs, or constraints.'
      : `I seeded a workable brief. Before locking, confirm the ${nextQuestion ?? 'remaining details'} you want emphasized.`,
    readyToLock,
    brief,
    missingFields,
  };
}

function isRetriableInterviewStepError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'AI_RetryError'
    || message.includes('high demand')
    || message.includes('try again later')
    || message.includes('rate limit')
    || message.includes('temporarily unavailable')
    || message.includes('overloaded')
    || message.includes('service unavailable');
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

async function generateInterviewStepWithFallback(input: {
  initialPrompt?: string | null;
  turns: InterviewTurn[];
  existingBrief: InterviewBrief | null;
  maxUserTurns: number;
}) {
  try {
    return await generateInterviewStep(input);
  } catch (error) {
    if (!isRetriableInterviewStepError(error)) {
      throw error;
    }

    const fallback = buildFallbackInterviewStep(input);
    if (!fallback) {
      throw error;
    }

    return fallback;
  }
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

  const step = await generateInterviewStepWithFallback({
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
  const step = await generateInterviewStepWithFallback({
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
    const step = await generateInterviewStepWithFallback({
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
