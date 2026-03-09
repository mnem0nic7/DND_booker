import type { ChapterOutline, EvaluationFinding } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { analyzeEstimatedArtifactLayout } from './layout-estimate.service.js';
import { analyzeCompiledBookStructure, type BookStructureReport } from './book-structure-preflight.service.js';

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
    layoutDocumentsAnalyzed: number;
    bookStructureDocumentsAnalyzed: number;
    compiledTocEntries: number;
  };
}

interface DocumentLayoutReport {
  documentSlug: string;
  title: string;
  kind: string;
  estimatedPages: number;
  findings: EvaluationFinding[];
  summary: string;
}

const BLOCKING_LAYOUT_CODES = new Set([
  'CONSECUTIVE_PAGE_BREAKS',
  'NEARLY_BLANK_PAGE_AFTER_BREAK',
]);

function mapLayoutFindingSeverity(finding: EvaluationFinding): PreflightSeverity {
  if (finding.severity === 'critical') return 'error';
  if (BLOCKING_LAYOUT_CODES.has(finding.code)) return 'error';
  if (finding.severity === 'major' || finding.severity === 'minor') return 'warning';
  return 'info';
}

function buildPreflightSummary(result: PreflightResult): string {
  const errors = result.issues.filter((issue) => issue.severity === 'error').length;
  const warnings = result.issues.filter((issue) => issue.severity === 'warning').length;

  return [
    result.passed ? 'Preflight passed.' : 'Preflight failed.',
    `${result.stats.documentsCreated} document(s) checked.`,
    `${errors} error(s), ${warnings} warning(s).`,
  ].join(' ');
}

async function persistPreflightReport(
  run: { id: string; projectId: string },
  result: PreflightResult,
  documentLayouts: DocumentLayoutReport[],
  bookStructure: BookStructureReport,
): Promise<void> {
  const latest = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'preflight_report',
      artifactKey: 'preflight-report',
    },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'preflight_report',
      artifactKey: 'preflight-report',
      status: result.passed ? 'accepted' : 'failed_evaluation',
      version: (latest?.version ?? 0) + 1,
      title: 'Preflight Report',
      summary: buildPreflightSummary(result),
      jsonContent: {
        passed: result.passed,
        issues: result.issues,
        stats: result.stats,
        documentLayouts,
        bookStructure,
      } as any,
      metadata: {
        errorCount: result.issues.filter((issue) => issue.severity === 'error').length,
        warningCount: result.issues.filter((issue) => issue.severity === 'warning').length,
        layoutDocumentsAnalyzed: result.stats.layoutDocumentsAnalyzed,
        bookStructureDocumentsAnalyzed: result.stats.bookStructureDocumentsAnalyzed,
        compiledTocEntries: result.stats.compiledTocEntries,
      } as any,
      pageEstimate: result.stats.totalPageEstimate || null,
    },
  });
}

/**
 * Run preflight checks on the assembled documents for a generation run.
 */
export async function runPreflight(
  run: { id: string; projectId: string },
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  const documentLayouts: DocumentLayoutReport[] = [];

  // Load created documents
  const documents = await prisma.projectDocument.findMany({
    where: { runId: run.id, projectId: run.projectId },
    orderBy: { sortOrder: 'asc' },
  });
  const chapterDocs = documents.filter((d) => d.kind === 'chapter');
  const docsBySlug = new Map(documents.map((d) => [d.slug, d]));

  // Load outline for expected structure
  const outlineArtifact = await prisma.generatedArtifact.findFirst({
    where: { runId: run.id, artifactType: 'chapter_outline', status: 'accepted' },
    orderBy: { version: 'desc' },
  });

  let outline: ChapterOutline | null = null;
  if (!outlineArtifact?.jsonContent) {
    issues.push({
      severity: 'error',
      code: 'NO_OUTLINE',
      message: 'No accepted chapter outline found',
    });
  } else {
    outline = outlineArtifact.jsonContent as unknown as ChapterOutline;
  }

  // Check 1: Completeness — every chapter in outline has a document
  if (outline) {
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
  if (outline) {
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

  const bookStructure = analyzeCompiledBookStructure(
    documents.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      kind: doc.kind,
      sortOrder: doc.sortOrder,
      content: doc.content,
    })),
  );
  issues.push(...bookStructure.issues);

  // Check 5: Compiled document layout quality
  for (const doc of documents) {
    const layout = analyzeEstimatedArtifactLayout(doc.content);
    if (!layout) continue;

    documentLayouts.push({
      documentSlug: doc.slug,
      title: doc.title,
      kind: doc.kind,
      estimatedPages: layout.estimatedPages,
      findings: layout.findings,
      summary: layout.summary,
    });

    for (const finding of layout.findings) {
      issues.push({
        severity: mapLayoutFindingSeverity(finding),
        code: `LAYOUT_${finding.code}`,
        message: `${doc.title}: ${finding.message}`,
        documentSlug: doc.slug,
      });
    }
  }

  // Compute stats
  const totalPageEstimate = outline
    ? outline.chapters.reduce((sum, ch) => sum + ch.targetPages, 0)
      + outline.appendices.reduce((sum, app) => sum + app.targetPages, 0)
    : 0;

  const hasErrors = issues.some((i) => i.severity === 'error');
  const result: PreflightResult = {
    passed: !hasErrors,
    issues,
    stats: {
      documentsCreated: documents.length,
      chaptersExpected: outline?.chapters.length ?? 0,
      chaptersFound: chapterDocs.length,
      totalPageEstimate,
      layoutDocumentsAnalyzed: documentLayouts.length,
      bookStructureDocumentsAnalyzed: bookStructure.stats.documentsAnalyzed,
      compiledTocEntries: bookStructure.stats.tocEntries,
    },
  };

  await persistPreflightReport(run, result, documentLayouts, bookStructure);

  return result;
}
