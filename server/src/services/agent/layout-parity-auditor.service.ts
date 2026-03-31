import type { ExportReviewCode } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { applySafeExportReviewFixes } from '../export-fix.service.js';

const PARITY_REVIEW_CODES = new Set<ExportReviewCode>([
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

export async function auditLayoutParityFromReview(input: {
  exportJobId: string;
  userId: string;
  projectId: string;
  targetTitle?: string | null;
}) {
  const exportJob = await prisma.exportJob.findFirst({
    where: {
      id: input.exportJobId,
      userId: input.userId,
      projectId: input.projectId,
    },
    select: {
      id: true,
      projectId: true,
      userId: true,
      format: true,
      reviewJson: true,
    },
  });

  if (!exportJob) {
    return {
      status: 'no_review' as const,
      summary: 'No export review was available to audit for layout parity.',
      appliedFixCount: 0,
      documentsUpdated: 0,
      changes: [],
      unsupportedFindingCount: 0,
    };
  }

  const result = await applySafeExportReviewFixes(exportJob as Parameters<typeof applySafeExportReviewFixes>[0], {
    allowedCodes: PARITY_REVIEW_CODES,
    targetTitle: input.targetTitle ?? null,
  });

  return {
    status: result.status,
    summary: result.summary,
    appliedFixCount: result.appliedFixCount,
    documentsUpdated: result.documentsUpdated,
    changes: result.changes,
    unsupportedFindingCount: result.unsupportedFindingCount,
  };
}
