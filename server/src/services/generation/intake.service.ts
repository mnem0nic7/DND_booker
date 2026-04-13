import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { MODE_DEFAULTS, type NormalizedInput, type GenerationConstraints } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { generateObjectWithTimeout } from './model-timeouts.js';
import {
  buildNormalizeInputSystemPrompt,
  buildNormalizeInputUserPrompt,
} from './prompts/normalize-input.prompt.js';

const NormalizedInputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  inferredMode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']),
  tone: z.string(),
  themes: z.array(z.string()),
  setting: z.string(),
  premise: z.string(),
  levelRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  pageTarget: z.number(),
  chapterEstimate: z.number(),
  constraints: z.object({
    strict5e: z.boolean(),
    includeHandouts: z.boolean(),
    includeMaps: z.boolean(),
  }),
  keyElements: z.object({
    npcs: z.array(z.string()),
    locations: z.array(z.string()),
    plotHooks: z.array(z.string()),
    items: z.array(z.string()),
  }),
});

const NormalizedInputCandidateSchema = z.object({
  title: z.string(),
  summary: z.string(),
  inferredMode: z.union([z.enum(['one_shot', 'module', 'campaign', 'sourcebook']), z.string()]),
  tone: z.string(),
  themes: z.union([z.array(z.string()), z.string()]).optional().default([]),
  setting: z.string(),
  premise: z.string(),
  levelRange: z.union([
    z.object({
      min: z.union([z.number(), z.string()]).optional(),
      max: z.union([z.number(), z.string()]).optional(),
    }).passthrough(),
    z.number(),
    z.string(),
    z.null(),
  ]).optional().default(null),
  pageTarget: z.union([z.number(), z.string()]).optional(),
  chapterEstimate: z.union([z.number(), z.string()]).optional(),
  constraints: z.object({
    strict5e: z.union([z.boolean(), z.string()]).optional(),
    includeHandouts: z.union([z.boolean(), z.string()]).optional(),
    includeMaps: z.union([z.boolean(), z.string()]).optional(),
  }).partial().optional().default({}),
  keyElements: z.object({
    npcs: z.union([z.array(z.string()), z.string()]).optional(),
    locations: z.union([z.array(z.string()), z.string()]).optional(),
    plotHooks: z.union([z.array(z.string()), z.string()]).optional(),
    items: z.union([z.array(z.string()), z.string()]).optional(),
  }).partial().optional().default({}),
}).passthrough();

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function coerceBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function resolveGenerationMode(value: unknown): NormalizedInput['inferredMode'] {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized === 'one_shot' || normalized === 'module' || normalized === 'campaign' || normalized === 'sourcebook') {
      return normalized;
    }
  }

  return 'one_shot';
}

function coerceLevelRange(value: unknown): { min: number; max: number } | null {
  if (value == null || value === '') return null;

  const directNumber = coerceNumber(value);
  if (directNumber !== undefined) {
    return { min: directNumber, max: directNumber };
  }

  if (typeof value === 'string') {
    const matches = [...value.matchAll(/\d+/g)]
      .map((match) => Number.parseInt(match[0], 10))
      .filter((entry) => Number.isFinite(entry));

    if (matches.length === 1) {
      return { min: matches[0], max: matches[0] };
    }

    if (matches.length >= 2) {
      const [first, second] = matches;
      return { min: Math.min(first, second), max: Math.max(first, second) };
    }

    return null;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const min = coerceNumber(record.min);
    const max = coerceNumber(record.max);

    if (min !== undefined && max !== undefined) {
      return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    if (min !== undefined) {
      return { min, max: min };
    }

    if (max !== undefined) {
      return { min: max, max };
    }
  }

  return null;
}

function midpoint([min, max]: [number, number]): number {
  return Math.round((min + max) / 2);
}

function normalizeParsedInput(
  value: unknown,
  options?: {
    pageTargetHint?: number | null;
  },
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const inferredMode = resolveGenerationMode(record.inferredMode);
  const modeDefaults = MODE_DEFAULTS[inferredMode];
  const rawConstraints = (record.constraints && typeof record.constraints === 'object' && !Array.isArray(record.constraints))
    ? record.constraints as Record<string, unknown>
    : {};
  const rawKeyElements = (record.keyElements && typeof record.keyElements === 'object' && !Array.isArray(record.keyElements))
    ? record.keyElements as Record<string, unknown>
    : {};

  return {
    ...record,
    inferredMode,
    themes: coerceStringArray(record.themes),
    levelRange: coerceLevelRange(record.levelRange),
    pageTarget: coerceNumber(record.pageTarget) ?? options?.pageTargetHint ?? midpoint(modeDefaults.pageRange),
    chapterEstimate: coerceNumber(record.chapterEstimate) ?? midpoint(modeDefaults.chapterRange),
    constraints: {
      strict5e: coerceBoolean(rawConstraints.strict5e, true),
      includeHandouts: coerceBoolean(rawConstraints.includeHandouts, false),
      includeMaps: coerceBoolean(rawConstraints.includeMaps, false),
    },
    keyElements: {
      npcs: coerceStringArray(rawKeyElements.npcs),
      locations: coerceStringArray(rawKeyElements.locations),
      plotHooks: coerceStringArray(rawKeyElements.plotHooks),
      items: coerceStringArray(rawKeyElements.items),
    },
  };
}

export interface IntakeResult {
  normalizedInput: NormalizedInput;
  artifactId: string;
}

/**
 * Execute the intake normalization step.
 * Takes a GenerationRun with a freeform inputPrompt, calls AI to extract
 * structured data, creates a project_profile artifact, and updates the run.
 */
export async function executeIntake(
  run: {
    id: string;
    projectId: string;
    userId: string;
    inputPrompt: string;
    inputParameters: unknown;
    pageTargetHint?: number | null;
  },
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<IntakeResult> {
  const existingArtifact = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'project_profile',
      artifactKey: 'project-profile',
      version: 1,
    },
    select: {
      id: true,
      jsonContent: true,
    },
  });

  if (existingArtifact?.jsonContent) {
    const normalizedInput = NormalizedInputSchema.parse(normalizeParsedInput(existingArtifact.jsonContent, {
      pageTargetHint: run.pageTargetHint ?? null,
    })) as NormalizedInput;

    await prisma.generationRun.update({
      where: { id: run.id },
      data: {
        mode: normalizedInput.inferredMode,
        estimatedPages: normalizedInput.pageTarget,
      },
    });

    return {
      normalizedInput,
      artifactId: existingArtifact.id,
    };
  }

  const system = buildNormalizeInputSystemPrompt();
  const prompt = buildNormalizeInputUserPrompt(
    run.inputPrompt,
    run.inputParameters as GenerationConstraints | null,
  );

  const { object, usage } = await generateObjectWithTimeout('Input normalization', {
    model,
    schema: NormalizedInputCandidateSchema,
    system,
    prompt,
    maxOutputTokens,
  });

  const normalizedInput = NormalizedInputSchema.parse(normalizeParsedInput(object, {
    pageTargetHint: run.pageTargetHint ?? null,
  })) as NormalizedInput;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.$transaction(async (tx) => {
    const createdArtifact = await tx.generatedArtifact.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        artifactType: 'project_profile',
        artifactKey: 'project-profile',
        status: 'accepted',
        version: 1,
        title: normalizedInput.title,
        summary: normalizedInput.summary,
        jsonContent: normalizedInput as any,
        tokenCount: totalTokens,
      },
    });

    await tx.generationRun.update({
      where: { id: run.id },
      data: {
        mode: normalizedInput.inferredMode,
        estimatedPages: normalizedInput.pageTarget,
        actualTokens: { increment: totalTokens },
      },
    });

    return createdArtifact;
  });

  // Publish progress event
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'project_profile',
    title: normalizedInput.title,
    version: 1,
  });

  return { normalizedInput, artifactId: artifact.id };
}
