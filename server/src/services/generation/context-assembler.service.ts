import type { ChapterPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export interface EntityContext {
  slug: string;
  name: string;
  entityType: string;
  summary: string;
  canonicalData: unknown;
}

export interface PriorChapterSummary {
  slug: string;
  title: string;
  summary: string;
}

export interface ChapterWriteContext {
  entityDetails: EntityContext[];
  priorChapterSummaries: PriorChapterSummary[];
}

/**
 * Assemble context for chapter draft generation.
 * Fetches entity dossiers and prior chapter summaries from the database.
 */
export async function assembleChapterContext(
  runId: string,
  projectId: string,
  chapterPlan: ChapterPlan,
  priorChapterSlugs: string[],
): Promise<ChapterWriteContext> {
  // Fetch canon entity details for all referenced entities
  const entitySlugs = chapterPlan.entityReferences;
  const entities = entitySlugs.length > 0
    ? await prisma.canonEntity.findMany({
        where: {
          projectId,
          slug: { in: entitySlugs },
        },
        select: {
          slug: true,
          canonicalName: true,
          entityType: true,
          summary: true,
          canonicalData: true,
        },
      })
    : [];

  // Fetch prior chapter draft summaries for continuity
  const priorSummaries = priorChapterSlugs.length > 0
    ? await prisma.generatedArtifact.findMany({
        where: {
          runId,
          artifactType: 'chapter_draft',
          artifactKey: { in: priorChapterSlugs.map((s) => `chapter-draft-${s}`) },
        },
        select: {
          artifactKey: true,
          title: true,
          summary: true,
        },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  return {
    entityDetails: entities.map((e) => ({
      slug: e.slug,
      name: e.canonicalName,
      entityType: e.entityType,
      summary: e.summary,
      canonicalData: e.canonicalData,
    })),
    priorChapterSummaries: priorSummaries.map((a) => ({
      slug: a.artifactKey.replace('chapter-draft-', ''),
      title: a.title,
      summary: a.summary ?? '',
    })),
  };
}
