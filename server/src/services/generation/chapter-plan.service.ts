import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, ChapterOutlineEntry, ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import {
  buildChapterPlanSystemPrompt,
  buildChapterPlanUserPrompt,
} from './prompts/chapter-plan.prompt.js';

const SectionSpecSchema = z.object({
  slug: z.string(),
  title: z.string(),
  contentType: z.enum(['narrative', 'encounter', 'exploration', 'social', 'transition']),
  targetWords: z.number(),
  outline: z.string(),
  keyBeats: z.array(z.string()),
  entityReferences: z.array(z.string()),
  blocksNeeded: z.array(z.string()),
});

const EncounterSpecSchema = z.object({
  name: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']),
  enemies: z.array(z.object({ name: z.string(), count: z.number(), cr: z.string() })),
  environment: z.string(),
  tactics: z.string(),
  rewards: z.array(z.string()),
});

const ChapterPlanSchema = z.object({
  chapterSlug: z.string(),
  chapterTitle: z.string(),
  sections: z.array(SectionSpecSchema),
  encounters: z.array(EncounterSpecSchema),
  entityReferences: z.array(z.string()),
  readAloudCount: z.number(),
  dmTipCount: z.number(),
  difficultyProgression: z.string(),
});

export interface ChapterPlanResult {
  plan: ChapterPlan;
  artifactId: string;
}

export async function executeChapterPlanGeneration(
  run: { id: string; projectId: string },
  chapter: ChapterOutlineEntry,
  bible: BibleContent,
  entitySummaries: { slug: string; entityType: string; name: string; summary: string }[],
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ChapterPlanResult> {
  const system = buildChapterPlanSystemPrompt();
  const prompt = buildChapterPlanUserPrompt(chapter, bible, entitySummaries);

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const plan = ChapterPlanSchema.parse(parsed) as ChapterPlan;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'chapter_plan',
      artifactKey: `chapter-plan-${chapter.slug}`,
      status: 'generated',
      version: 1,
      title: `Plan: ${chapter.title}`,
      summary: `${plan.sections.length} sections, ${plan.encounters.length} encounters`,
      jsonContent: plan as any,
      tokenCount: totalTokens,
      pageEstimate: chapter.targetPages,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_plan',
    title: artifact.title,
    version: 1,
  });

  return { plan, artifactId: artifact.id };
}