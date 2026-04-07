import type { ExportReview, GeneratedArtifact } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export const EXPORT_REVIEW_ARTIFACT_PREFIX = 'export-review:';

export interface GenerationRunExportWindow {
  id: string;
  projectId: string;
  createdAt: Date;
}

export function isExportReviewArtifactId(artifactId: string): boolean {
  return artifactId.startsWith(EXPORT_REVIEW_ARTIFACT_PREFIX);
}

async function getLatestScopedExportJobForRun(
  run: GenerationRunExportWindow,
  userId: string,
) {
  const nextRun = await prisma.generationRun.findFirst({
    where: {
      projectId: run.projectId,
      userId,
      createdAt: { gt: run.createdAt },
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const candidateJobs = await prisma.exportJob.findMany({
    where: {
      projectId: run.projectId,
      userId,
      status: 'completed',
      createdAt: {
        gte: run.createdAt,
        ...(nextRun ? { lt: nextRun.createdAt } : {}),
      },
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
    take: 10,
  });

  return candidateJobs.find((job) => job.reviewJson != null) ?? null;
}

function buildExportReviewMarkdown(review: ExportReview): string {
  const findings = review.findings.length > 0
    ? review.findings.map((finding) => {
        const pageLabel = finding.page != null ? ` (page ${finding.page})` : '';
        return `- [${finding.severity}] ${finding.code}${pageLabel}: ${finding.message}`;
      }).join('\n')
    : '- No export-review findings.';

  const fixes = review.appliedFixes.length > 0
    ? review.appliedFixes.map((fix) => `- ${fix}`).join('\n')
    : '- None';

  return [
    '# Export Review',
    '',
    review.summary,
    '',
    `- Status: ${review.status}`,
    `- Score: ${review.score}`,
    `- Passes: ${review.passCount}`,
    `- Page count: ${review.metrics.pageCount}`,
    '',
    '## Applied Fixes',
    fixes,
    '',
    '## Findings',
    findings,
  ].join('\n');
}

function serializeExportReviewArtifact(
  runId: string,
  exportJob: {
    id: string;
    projectId: string;
    format: string;
    outputUrl: string | null;
    createdAt: Date;
    completedAt: Date | null;
    reviewJson: unknown;
  },
): GeneratedArtifact {
  const review = exportJob.reviewJson as ExportReview;
  const timestamp = (exportJob.completedAt ?? exportJob.createdAt).toISOString();

  return {
    id: `${EXPORT_REVIEW_ARTIFACT_PREFIX}${exportJob.id}`,
    runId,
    projectId: exportJob.projectId,
    sourceTaskId: null,
    artifactType: 'export_review',
    artifactKey: `export-review-${exportJob.id}`,
    parentArtifactId: null,
    status: review.status === 'passed' ? 'passed' : 'failed_evaluation',
    version: review.passCount,
    title: `${exportJob.format.toUpperCase()} Export Review`,
    summary: review.summary,
    jsonContent: review,
    markdownContent: buildExportReviewMarkdown(review),
    tiptapContent: null,
    metadata: {
      exportJobId: exportJob.id,
      exportFormat: exportJob.format,
      outputUrl: exportJob.outputUrl,
      generatedAt: review.generatedAt,
      reviewStatus: review.status,
      reviewScore: review.score,
      source: 'export_job',
    },
    pageEstimate: review.metrics.pageCount,
    tokenCount: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function getExportReviewArtifactForRun(
  run: GenerationRunExportWindow,
  userId: string,
): Promise<GeneratedArtifact | null> {
  const exportJob = await getLatestScopedExportJobForRun(run, userId);
  if (!exportJob || !exportJob.reviewJson) {
    return null;
  }

  return serializeExportReviewArtifact(run.id, exportJob);
}
