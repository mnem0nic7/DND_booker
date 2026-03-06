import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export type PreflightSeverity = 'error' | 'warning' | 'info';

export interface PreflightIssue {
  severity: PreflightSeverity;
  code: string;
  message: string;
  documentSlug?: string;
}

export interface PreflightResult {
  passed: boolean;
  issues: PreflightIssue[];
  stats: {
    documentsCreated: number;
    chaptersExpected: number;
    chaptersFound: number;
    totalPageEstimate: number;
  };
}

/**
 * Run preflight checks on the assembled documents for a generation run.
 */
export async function runPreflight(
  run: { id: string; projectId: string },
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];

  // Load outline for expected structure
  const outlineArtifact = await prisma.generatedArtifact.findFirst({
    where: { runId: run.id, artifactType: 'chapter_outline', status: 'accepted' },
    orderBy: { version: 'desc' },
  });

  if (!outlineArtifact?.jsonContent) {
    return {
      passed: false,
      issues: [{ severity: 'error', code: 'NO_OUTLINE', message: 'No accepted chapter outline found' }],
      stats: { documentsCreated: 0, chaptersExpected: 0, chaptersFound: 0, totalPageEstimate: 0 },
    };
  }

  const outline = outlineArtifact.jsonContent as unknown as ChapterOutline;

  // Load created documents
  const documents = await prisma.projectDocument.findMany({
    where: { runId: run.id, projectId: run.projectId },
    orderBy: { sortOrder: 'asc' },
  });

  const docsBySlug = new Map(documents.map((d) => [d.slug, d]));

  // Check 1: Completeness — every chapter in outline has a document
  const chapterDocs = documents.filter((d) => d.kind === 'chapter');
  for (const ch of outline.chapters) {
    if (!docsBySlug.has(ch.slug)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_CHAPTER',
        message: `Chapter "${ch.title}" (${ch.slug}) has no assembled document`,
        documentSlug: ch.slug,
      });
    }
  }

  // Check 2: Duplicate slugs
  const slugCounts = new Map<string, number>();
  for (const doc of documents) {
    slugCounts.set(doc.slug, (slugCounts.get(doc.slug) ?? 0) + 1);
  }
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_SLUG',
        message: `Document slug "${slug}" appears ${count} times`,
        documentSlug: slug,
      });
    }
  }

  // Check 3: Page budget tolerance (±20%)
  for (const ch of outline.chapters) {
    const doc = docsBySlug.get(ch.slug);
    if (doc?.targetPageCount && ch.targetPages) {
      const ratio = doc.targetPageCount / ch.targetPages;
      if (ratio < 0.8 || ratio > 1.2) {
        issues.push({
          severity: 'warning',
          code: 'PAGE_BUDGET_DRIFT',
          message: `Chapter "${ch.title}" target ${doc.targetPageCount}pp vs outline ${ch.targetPages}pp (${Math.round(ratio * 100)}%)`,
          documentSlug: ch.slug,
        });
      }
    }
  }

  // Check 4: Entity references exist
  const artifacts = await prisma.generatedArtifact.findMany({
    where: { runId: run.id, status: 'accepted', artifactType: 'chapter_draft' },
    include: { canonReferences: { include: { entity: true } } },
  });

  for (const artifact of artifacts) {
    for (const ref of artifact.canonReferences) {
      if (!ref.entity) {
        issues.push({
          severity: 'warning',
          code: 'ORPHAN_REFERENCE',
          message: `Artifact "${artifact.title}" references missing entity ${ref.entityId}`,
        });
      }
    }
  }

  // Compute stats
  const totalPageEstimate = outline.chapters.reduce((sum, ch) => sum + ch.targetPages, 0)
    + outline.appendices.reduce((sum, app) => sum + app.targetPages, 0);

  const hasErrors = issues.some((i) => i.severity === 'error');

  return {
    passed: !hasErrors,
    issues,
    stats: {
      documentsCreated: documents.length,
      chaptersExpected: outline.chapters.length,
      chaptersFound: chapterDocs.length,
      totalPageEstimate,
    },
  };
}
