import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, BibleContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import {
  buildCampaignBibleSystemPrompt,
  buildCampaignBibleUserPrompt,
} from './prompts/campaign-bible.prompt.js';

const BibleEntitySeedSchema = z.object({
  entityType: z.enum(['npc', 'location', 'faction', 'item', 'quest']),
  name: z.string(),
  slug: z.string(),
  summary: z.string(),
  details: z.record(z.unknown()),
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
    toneDescriptors: z.array(z.string()),
    forbiddenElements: z.array(z.string()),
    worldSpecificRules: z.array(z.string()),
  }),
  actStructure: z.array(z.object({
    act: z.number(),
    title: z.string(),
    summary: z.string(),
    levelRange: z.object({ min: z.number(), max: z.number() }),
    chapterSlugs: z.array(z.string()),
  })),
  timeline: z.array(z.object({
    order: z.number(),
    event: z.string(),
    timeframe: z.string(),
    significance: z.string(),
  })),
  levelProgression: z.object({
    type: z.enum(['milestone', 'xp']),
    milestones: z.array(z.string()),
  }).nullable(),
  pageBudget: z.array(z.object({
    slug: z.string(),
    title: z.string(),
    targetPages: z.number(),
    sections: z.array(z.string()),
  })),
  styleGuide: z.object({
    voice: z.string(),
    vocabulary: z.array(z.string()),
    avoidTerms: z.array(z.string()),
    narrativePerspective: z.string(),
    toneNotes: z.string(),
  }),
  openThreads: z.array(z.string()),
  entities: z.array(BibleEntitySeedSchema),
});

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

  const { text, usage } = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens,
  });

  // Parse and validate the AI response
  const parsed = parseJsonResponse(text);
  const bibleContent = BibleContentSchema.parse(parsed) as BibleContent;

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