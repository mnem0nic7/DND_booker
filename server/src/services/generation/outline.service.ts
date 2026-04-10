import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { normalizeGenerationContentType } from './content-type-normalizer.js';
import { generateObjectWithTimeout } from './model-timeouts.js';
import {
  buildChapterOutlineSystemPrompt,
  buildChapterOutlineUserPrompt,
} from './prompts/chapter-outline.prompt.js';

const SectionOutlineSchema = z.object({
  slug: z.string(),
  title: z.string(),
  sortOrder: z.number(),
  targetPages: z.number(),
  contentType: z.preprocess(
    normalizeGenerationContentType,
    z.enum(['narrative', 'encounter', 'exploration', 'social', 'transition']),
  ),
  summary: z.string(),
});

const ChapterOutlineEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  act: z.number(),
  sortOrder: z.number(),
  levelRange: z.object({ min: z.number(), max: z.number() }),
  targetPages: z.number(),
  summary: z.string(),
  keyEntities: z.array(z.string()),
  sections: z.array(SectionOutlineSchema),
});

const AppendixOutlineSchema = z.object({
  slug: z.string(),
  title: z.string(),
  targetPages: z.number(),
  sourceEntityTypes: z.array(z.string()),
  summary: z.string(),
});

const ChapterOutlineSchema = z.object({
  chapters: z.array(ChapterOutlineEntrySchema),
  appendices: z.array(AppendixOutlineSchema),
  totalPageEstimate: z.number(),
});

export interface OutlineResult {
  outline: ChapterOutline;
  artifactId: string;
}

export async function executeOutlineGeneration(
  run: { id: string; projectId: string },
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<OutlineResult> {
  const existingArtifact = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'chapter_outline',
      artifactKey: 'chapter-outline',
      version: 1,
    },
    select: {
      id: true,
      jsonContent: true,
    },
  });

  if (existingArtifact?.jsonContent) {
    return {
      outline: ChapterOutlineSchema.parse(existingArtifact.jsonContent) as ChapterOutline,
      artifactId: existingArtifact.id,
    };
  }

  const system = buildChapterOutlineSystemPrompt();
  const prompt = buildChapterOutlineUserPrompt(bible);

  const { object, usage } = await generateObjectWithTimeout('Chapter outline generation', {
    model, system, prompt, maxOutputTokens,
    schema: ChapterOutlineSchema,
  });
  const outline = ChapterOutlineSchema.parse(object) as ChapterOutline;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.$transaction(async (tx) => {
    const createdArtifact = await tx.generatedArtifact.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        artifactType: 'chapter_outline',
        artifactKey: 'chapter-outline',
        status: 'generated',
        version: 1,
        title: `${bible.title} — Chapter Outline`,
        summary: `${outline.chapters.length} chapters, ${outline.appendices.length} appendices, ~${outline.totalPageEstimate} pages`,
        jsonContent: outline as any,
        tokenCount: totalTokens,
        pageEstimate: outline.totalPageEstimate,
      },
    });

    await tx.generationRun.update({
      where: { id: run.id },
      data: { actualTokens: { increment: totalTokens } },
    });

    return createdArtifact;
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_outline',
    title: artifact.title,
    version: 1,
  });

  return { outline, artifactId: artifact.id };
}
