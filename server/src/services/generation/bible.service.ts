import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { generateTextWithTimeout } from './model-timeouts.js';
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
  const system = buildCampaignBibleSystemPrompt();
  const prompt = buildCampaignBibleUserPrompt(normalizedInput);

  const { text, usage } = await generateTextWithTimeout('Campaign bible generation', {
    model,
    system,
    prompt,
    maxOutputTokens,
  });

  // Parse and validate the AI response
  const parsed = parseJsonResponse(text);
  const bibleContent = normalizeBibleContent(parsed, normalizedInput);

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  // Create CampaignBible record
  const bible = await prisma.campaignBible.create({
    data: {
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

  // Create the campaign_bible artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
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

  // Create CanonEntity records for each entity seed
  const entities = await Promise.all(
    bibleContent.entities.map((seed) =>
      prisma.canonEntity.create({
        data: {
          projectId: run.projectId,
          runId: run.id,
          entityType: seed.entityType,
          slug: seed.slug,
          canonicalName: seed.name,
          aliases: [] as any,
          canonicalData: seed.details as any,
          summary: seed.summary,
          sourceArtifactId: artifact.id,
        },
      }),
    ),
  );

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: {
      actualTokens: { increment: totalTokens },
    },
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
