import type { LanguageModel } from 'ai';
import { Prisma } from '@prisma/client';
import type { BibleContent, ChapterPlan, ChapterOutlineEntry } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { assembleChapterContext } from './context-assembler.service.js';
import {
  buildChapterDraftSystemPrompt,
  buildChapterDraftUserPrompt,
} from './prompts/chapter-draft.prompt.js';
import { generateTextWithTimeout } from './model-timeouts.js';
import { convertMarkdownToTipTapWithTimeout } from './markdown-artifact-conversion.service.js';

export interface ChapterDraftResult {
  artifactId: string;
  chapterSlug: string;
  title: string;
  wordCount: number;
}

const MAX_CHAPTER_DRAFT_OUTPUT_TOKENS = 6144;

/**
 * Generate a chapter draft.
 * Assembles context, calls AI for markdown prose, persists it immediately,
 * and then hydrates TipTap JSON behind a bounded conversion step.
 */
export async function executeChapterDraftGeneration(
  run: { id: string; projectId: string },
  chapter: ChapterOutlineEntry,
  plan: ChapterPlan,
  bible: BibleContent,
  priorChapterSlugs: string[],
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ChapterDraftResult> {
  // Assemble context (entity dossiers + prior chapter summaries)
  const context = await assembleChapterContext(
    run.id,
    run.projectId,
    plan,
    priorChapterSlugs,
  );

  const system = buildChapterDraftSystemPrompt();
  const prompt = buildChapterDraftUserPrompt(
    chapter,
    plan,
    bible,
    context.entityDetails,
    context.priorChapterSummaries,
  );

  const { text, usage } = await generateTextWithTimeout(`Chapter draft generation for ${chapter.title}`, {
    model,
    system,
    prompt,
    maxOutputTokens: Math.min(maxOutputTokens, MAX_CHAPTER_DRAFT_OUTPUT_TOKENS),
  });

  // Count words in the markdown
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  // Create the chapter_draft artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'chapter_draft',
      artifactKey: `chapter-draft-${chapter.slug}`,
      status: 'generated',
      version: 1,
      title: chapter.title,
      summary: `${wordCount} words, ${plan.sections.length} sections`,
      markdownContent: text,
      tiptapContent: Prisma.DbNull,
      jsonContent: {
        chapterSlug: chapter.slug,
        act: chapter.act,
        wordCount,
        sectionCount: plan.sections.length,
        encounterCount: plan.encounters.length,
      } as any,
      tokenCount: totalTokens,
      pageEstimate: chapter.targetPages,
    },
  });

  // Create CanonReferences for entities used in this chapter
  const entitySlugs = plan.entityReferences;
  if (entitySlugs.length > 0) {
    const entities = await prisma.canonEntity.findMany({
      where: { projectId: run.projectId, slug: { in: entitySlugs } },
      select: { id: true },
    });

    await Promise.all(
      entities.map((entity) =>
        prisma.canonReference.create({
          data: {
            entityId: entity.id,
            artifactId: artifact.id,
            referenceType: 'mentions',
          },
        }),
      ),
    );
  }

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  // Publish progress event
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'chapter_draft',
    title: chapter.title,
    version: 1,
  });

  try {
    const tiptapContent = await convertMarkdownToTipTapWithTimeout(
      text,
      `Chapter draft conversion for ${chapter.title}`,
    );

    await prisma.generatedArtifact.update({
      where: { id: artifact.id },
      data: { tiptapContent: tiptapContent as any },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown markdown conversion failure';
    await publishGenerationEvent(run.id, {
      type: 'run_warning',
      runId: run.id,
      message: `Stored markdown for "${chapter.title}", but TipTap conversion failed: ${message}`,
      severity: 'warning',
    });
  }

  return {
    artifactId: artifact.id,
    chapterSlug: chapter.slug,
    title: chapter.title,
    wordCount,
  };
}
