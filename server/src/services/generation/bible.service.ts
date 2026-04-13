import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { generateObjectWithTimeout } from './model-timeouts.js';
import {
  buildCampaignBibleSystemPrompt,
  buildCampaignBibleUserPrompt,
} from './prompts/campaign-bible.prompt.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entity';
}

const BibleEntitySeedSchema = z.object({
  entityType: z.enum(['npc', 'location', 'faction', 'item', 'quest']),
  name: z.string(),
  slug: z.string(),
  summary: z.string(),
  details: z.record(z.unknown()).default({}),
});

const BibleContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  premise: z.string(),
  worldRules: z.object({
    setting: z.string(),
    era: z.string(),
    magicLevel: z.string(),
    technologyLevel: z.string(),
    toneDescriptors: z.array(z.string()).default([]),
    forbiddenElements: z.array(z.string()).default([]),
    worldSpecificRules: z.array(z.string()).default([]),
  }),
  actStructure: z.array(z.object({
    act: z.number(),
    title: z.string(),
    summary: z.string(),
    levelRange: z.object({ min: z.number(), max: z.number() }),
    chapterSlugs: z.array(z.string()),
  })).default([]),
  timeline: z.array(z.object({
    order: z.number(),
    event: z.string(),
    timeframe: z.string(),
    significance: z.string(),
  })).default([]),
  levelProgression: z.object({
    type: z.enum(['milestone', 'xp']),
    milestones: z.array(z.string()),
  }).nullable().default(null),
  pageBudget: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    targetPages: z.number(),
    sections: z.array(z.string()),
  })).default([]),
  styleGuide: z.object({
    voice: z.string(),
    vocabulary: z.array(z.string()).default([]),
    avoidTerms: z.array(z.string()).default([]),
    narrativePerspective: z.string(),
    toneNotes: z.string(),
  }),
  openThreads: z.array(z.string()).default([]),
  entities: z.array(BibleEntitySeedSchema).default([]),
});

const BibleContentCandidateSchema = z.object({
  title: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  premise: z.string().optional().default(''),
  worldRules: z.record(z.unknown()).optional().default({}),
  actStructure: z.array(z.record(z.unknown())).optional().default([]),
  timeline: z.array(z.record(z.unknown())).optional().default([]),
  levelProgression: z.record(z.unknown()).nullable().optional().default(null),
  pageBudget: z.array(z.record(z.unknown())).optional().default([]),
  styleGuide: z.record(z.unknown()).optional().default({}),
  openThreads: z.array(z.string()).optional().default([]),
  entities: z.array(z.record(z.unknown())).optional().default([]),
}).passthrough();

function buildFallbackEntities(normalizedInput: NormalizedInput): BibleContent['entities'] {
  const entities: BibleContent['entities'] = [];
  const seen = new Set<string>();

  const pushEntity = (
    entityType: BibleContent['entities'][number]['entityType'],
    name: string,
    summary: string,
    details: Record<string, unknown>,
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const slug = slugify(trimmedName);
    const key = `${entityType}:${slug}`;
    if (seen.has(key)) return;
    seen.add(key);
    entities.push({
      entityType,
      name: trimmedName,
      slug,
      summary,
      details,
    });
  };

  for (const npc of normalizedInput.keyElements.npcs) {
    pushEntity(
      'npc',
      npc,
      `${npc} is a named NPC that should matter during the adventure.`,
      { role: 'named contact' },
    );
  }

  for (const location of normalizedInput.keyElements.locations) {
    pushEntity(
      'location',
      location,
      `${location} is a featured location in the adventure.`,
      { locationType: 'adventure location' },
    );
  }

  for (const item of normalizedInput.keyElements.items) {
    pushEntity(
      'item',
      item,
      `${item} is an item the adventure should reference explicitly.`,
      { itemType: 'adventure item' },
    );
  }

  for (const hook of normalizedInput.keyElements.plotHooks.slice(0, 2)) {
    pushEntity(
      'quest',
      hook,
      `${hook} is a core objective or hook that drives play.`,
      { questType: normalizedInput.inferredMode },
    );
  }

  return entities;
}

function normalizeBibleContent(parsed: unknown, normalizedInput: NormalizedInput): BibleContent {
  const raw = isRecord(parsed) ? parsed : {};
  const worldRules = isRecord(raw.worldRules) ? raw.worldRules : {};
  const styleGuide = isRecord(raw.styleGuide) ? raw.styleGuide : {};

  const normalized = {
    ...raw,
    title: normalizeString(raw.title, normalizedInput.title),
    summary: normalizeString(raw.summary, normalizedInput.summary),
    premise: normalizeString(raw.premise, normalizedInput.premise),
    worldRules: {
      ...worldRules,
      setting: normalizeString(worldRules.setting, normalizedInput.setting),
      era: normalizeString(worldRules.era, normalizedInput.inferredMode === 'campaign' ? 'Campaign Era' : 'Adventure Present'),
      magicLevel: normalizeString(worldRules.magicLevel, normalizedInput.constraints.strict5e ? 'standard' : 'mixed'),
      technologyLevel: normalizeString(worldRules.technologyLevel, 'medieval'),
      toneDescriptors: normalizeStringArray(worldRules.toneDescriptors, [normalizedInput.tone]),
      forbiddenElements: normalizeStringArray(worldRules.forbiddenElements),
      worldSpecificRules: normalizeStringArray(worldRules.worldSpecificRules),
    },
    styleGuide: {
      ...styleGuide,
      voice: normalizeString(styleGuide.voice, 'Clear, table-usable, and evocative.'),
      vocabulary: normalizeStringArray(styleGuide.vocabulary, normalizedInput.themes),
      avoidTerms: normalizeStringArray(styleGuide.avoidTerms),
      narrativePerspective: normalizeString(styleGuide.narrativePerspective, 'second person'),
      toneNotes: normalizeString(styleGuide.toneNotes, `Match a ${normalizedInput.tone} tone and prioritize DM usability.`),
    },
    openThreads: normalizeStringArray(raw.openThreads),
    entities: Array.isArray(raw.entities) ? raw.entities : [],
  };

  const bibleContent = BibleContentSchema.parse(normalized) as BibleContent;
  if (bibleContent.entities.length > 0) return bibleContent;

  return {
    ...bibleContent,
    entities: buildFallbackEntities(normalizedInput),
  };
}

export interface BibleResult {
  bible: { id: string; runId: string; title: string };
  artifactId: string;
  entities: { id: string; entityType: string; slug: string; canonicalName: string }[];
}

/**
 * Execute campaign bible generation.
 * Takes a NormalizedInput (from intake), calls AI to generate a full
 * campaign bible, creates CampaignBible + artifact + CanonEntity records.
 */
export async function executeBibleGeneration(
  run: { id: string; projectId: string; userId: string },
  normalizedInput: NormalizedInput,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<BibleResult> {
  const [existingArtifact, existingBible, existingEntities] = await Promise.all([
    prisma.generatedArtifact.findFirst({
      where: {
        runId: run.id,
        artifactType: 'campaign_bible',
        artifactKey: 'campaign-bible',
        version: 1,
      },
      select: {
        id: true,
      },
    }),
    prisma.campaignBible.findUnique({
      where: { runId: run.id },
      select: {
        id: true,
        runId: true,
        title: true,
      },
    }),
    prisma.canonEntity.findMany({
      where: { runId: run.id },
      select: {
        id: true,
        entityType: true,
        slug: true,
        canonicalName: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (existingArtifact && existingBible) {
    return {
      bible: existingBible,
      artifactId: existingArtifact.id,
      entities: existingEntities,
    };
  }

  const system = buildCampaignBibleSystemPrompt();
  const prompt = buildCampaignBibleUserPrompt(normalizedInput);

  const { object, usage } = await generateObjectWithTimeout('Campaign bible generation', {
    model,
    schema: BibleContentCandidateSchema,
    system,
    prompt,
    maxOutputTokens,
  });

  const bibleContent = normalizeBibleContent(object, normalizedInput);

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const { bible, artifact, entities } = await prisma.$transaction(async (tx) => {
    const persistedBible = await tx.campaignBible.upsert({
      where: { runId: run.id },
      update: {
        projectId: run.projectId,
        title: bibleContent.title,
        summary: bibleContent.summary,
        premise: bibleContent.premise,
        worldRules: bibleContent.worldRules as any,
        actStructure: bibleContent.actStructure as any,
        timeline: bibleContent.timeline as any,
        levelProgression: bibleContent.levelProgression as any,
        pageBudget: bibleContent.pageBudget as any,
        styleGuide: bibleContent.styleGuide as any,
        openThreads: bibleContent.openThreads as any,
        status: 'draft',
      },
      create: {
        runId: run.id,
        projectId: run.projectId,
        title: bibleContent.title,
        summary: bibleContent.summary,
        premise: bibleContent.premise,
        worldRules: bibleContent.worldRules as any,
        actStructure: bibleContent.actStructure as any,
        timeline: bibleContent.timeline as any,
        levelProgression: bibleContent.levelProgression as any,
        pageBudget: bibleContent.pageBudget as any,
        styleGuide: bibleContent.styleGuide as any,
        openThreads: bibleContent.openThreads as any,
        status: 'draft',
      },
    });

    const persistedArtifact = await tx.generatedArtifact.upsert({
      where: {
        runId_artifactType_artifactKey_version: {
          runId: run.id,
          artifactType: 'campaign_bible',
          artifactKey: 'campaign-bible',
          version: 1,
        },
      },
      update: {
        projectId: run.projectId,
        status: 'generated',
        title: bibleContent.title,
        summary: bibleContent.summary,
        jsonContent: bibleContent as any,
        tokenCount: totalTokens,
      },
      create: {
        runId: run.id,
        projectId: run.projectId,
        artifactType: 'campaign_bible',
        artifactKey: 'campaign-bible',
        status: 'generated',
        version: 1,
        title: bibleContent.title,
        summary: bibleContent.summary,
        jsonContent: bibleContent as any,
        tokenCount: totalTokens,
      },
    });

    const persistedEntities = await Promise.all(
      bibleContent.entities.map((seed) =>
        tx.canonEntity.upsert({
          where: {
            runId_entityType_slug: {
              runId: run.id,
              entityType: seed.entityType,
              slug: seed.slug,
            },
          },
          update: {
            projectId: run.projectId,
            canonicalName: seed.name,
            aliases: [] as any,
            canonicalData: seed.details as any,
            summary: seed.summary,
            sourceArtifactId: persistedArtifact.id,
          },
          create: {
            projectId: run.projectId,
            runId: run.id,
            entityType: seed.entityType,
            slug: seed.slug,
            canonicalName: seed.name,
            aliases: [] as any,
            canonicalData: seed.details as any,
            summary: seed.summary,
            sourceArtifactId: persistedArtifact.id,
          },
        }),
      ),
    );

    await tx.generationRun.update({
      where: { id: run.id },
      data: {
        actualTokens: { increment: totalTokens },
      },
    });

    return {
      bible: persistedBible,
      artifact: persistedArtifact,
      entities: persistedEntities,
    };
  });

  // Publish progress events
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'campaign_bible',
    title: bibleContent.title,
    version: 1,
  });

  return {
    bible: { id: bible.id, runId: bible.runId, title: bible.title },
    artifactId: artifact.id,
    entities: entities.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      slug: e.slug,
      canonicalName: e.canonicalName,
    })),
  };
}
