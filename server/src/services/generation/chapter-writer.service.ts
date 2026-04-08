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
import { normalizeGeneratedMarkdown } from './markdown-normalizer.js';

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
  const existingArtifact = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'chapter_draft',
      artifactKey: `chapter-draft-${chapter.slug}`,
      version: 1,
    },
    select: {
      id: true,
      title: true,
      markdownContent: true,
      tiptapContent: true,
      jsonContent: true,
    },
  });

  if (existingArtifact) {
    const normalizedMarkdown = existingArtifact.markdownContent
      ? normalizeGeneratedMarkdown(existingArtifact.markdownContent)
      : null;

    if (!existingArtifact.tiptapContent && normalizedMarkdown) {
      try {
        const tiptapContent = await convertMarkdownToTipTapWithTimeout(
          normalizedMarkdown,
          `Chapter draft conversion for ${existingArtifact.title}`,
        );

        await prisma.generatedArtifact.update({
          where: { id: existingArtifact.id },
          data: {
            markdownContent: normalizedMarkdown,
            tiptapContent: tiptapContent as any,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown markdown conversion failure';
        await publishGenerationEvent(run.id, {
          type: 'run_warning',
          runId: run.id,
          message: `Stored markdown for "${existingArtifact.title}", but TipTap conversion failed: ${message}`,
          severity: 'warning',
        });
      }
    }

    return {
      artifactId: existingArtifact.id,
      chapterSlug: chapter.slug,
      title: chapter.title,
      wordCount: resolvePersistedWordCount(existingArtifact.jsonContent, normalizedMarkdown),
    };
  }

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
  const normalizedText = normalizeGeneratedMarkdown(text);

  // Count words in the markdown
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.$transaction(async (tx) => {
    const createdArtifact = await tx.generatedArtifact.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        artifactType: 'chapter_draft',
        artifactKey: `chapter-draft-${chapter.slug}`,
        status: 'generated',
        version: 1,
        title: chapter.title,
        summary: `${wordCount} words, ${plan.sections.length} sections`,
        markdownContent: normalizedText,
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

    const entitySlugs = plan.entityReferences;
    if (entitySlugs.length > 0) {
      const entities = await tx.canonEntity.findMany({
        where: { projectId: run.projectId, slug: { in: entitySlugs } },
        select: { id: true },
      });

      if (entities.length > 0) {
        await tx.canonReference.createMany({
          data: entities.map((entity) => ({
            entityId: entity.id,
            artifactId: createdArtifact.id,
            referenceType: 'mentions',
          })),
        });
      }
    }

    await tx.generationRun.update({
      where: { id: run.id },
      data: { actualTokens: { increment: totalTokens } },
    });

    return createdArtifact;
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
      normalizedText,
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

function resolvePersistedWordCount(jsonContent: unknown, markdownContent: string | null): number {
  if (jsonContent && typeof jsonContent === 'object' && !Array.isArray(jsonContent)) {
    const candidate = (jsonContent as { wordCount?: unknown }).wordCount;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return markdownContent
    ? markdownContent.split(/\s+/).filter(Boolean).length
    : 0;
}
