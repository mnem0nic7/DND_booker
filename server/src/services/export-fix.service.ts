import type { Prisma } from '@prisma/client';
import type {
  DocumentContent,
  ExportReview,
  ExportReviewCode,
  ExportReviewFixChange,
  ExportReviewFixResult,
} from '@dnd-booker/shared';
import {
  normalizeEncounterEntries,
  normalizeStatBlockAttrs,
  resolveRandomTableEntries,
} from '@dnd-booker/shared';
import type { ExportJob as PrismaExportJob } from '@prisma/client';
import { prisma } from '../config/database.js';

const FIXABLE_CODES = new Set<ExportReviewCode>([
  'EXPORT_EMPTY_ENCOUNTER_TABLE',
  'EXPORT_EMPTY_RANDOM_TABLE',
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_OVERSIZED_DISPLAY_HEADING',
]);

type FixableReviewCode = typeof FIXABLE_CODES extends Set<infer T> ? T : never;

type ProjectDocumentRecord = {
  id: string;
  title: string;
  content: DocumentContent | null;
};

type AppliedFixCounter = {
  encounterTablesRemoved: number;
  randomTablesRemoved: number;
  placeholderStatBlocksRemoved: number;
  oversizedHeadingsDemoted: number;
};

function emptyFixCounter(): AppliedFixCounter {
  return {
    encounterTablesRemoved: 0,
    randomTablesRemoved: 0,
    placeholderStatBlocksRemoved: 0,
    oversizedHeadingsDemoted: 0,
  };
}

function mergeFixCounters(target: AppliedFixCounter, source: AppliedFixCounter) {
  target.encounterTablesRemoved += source.encounterTablesRemoved;
  target.randomTablesRemoved += source.randomTablesRemoved;
  target.placeholderStatBlocksRemoved += source.placeholderStatBlocksRemoved;
  target.oversizedHeadingsDemoted += source.oversizedHeadingsDemoted;
}

function getFindingTitle(finding: ExportReview['findings'][number]): string | null {
  const detailsTitle = finding.details && typeof finding.details === 'object'
    ? (finding.details as Record<string, unknown>).title
    : null;
  return typeof detailsTitle === 'string' && detailsTitle.trim().length > 0
    ? detailsTitle.trim()
    : null;
}

function isPlaceholderStatBlock(node: DocumentContent): boolean {
  const attrs = normalizeStatBlockAttrs(node.attrs ?? {});
  const name = typeof attrs.name === 'string' ? attrs.name : attrs.name == null ? '' : String(attrs.name);
  const ac = Number(attrs.ac);
  const hp = Number(attrs.hp);

  if (!name.trim()) return true;
  if (!Number.isFinite(ac) || !Number.isFinite(hp)) return true;
  return ac <= 0 || hp <= 0;
}

function isOversizedDisplayHeading(node: DocumentContent): boolean {
  const level = readNumberAttr(node, 'level');
  if (!Number.isFinite(level) || level < 1 || level > 2) return false;

  const text = readNodeText(node).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return text.length >= 70 || wordCount >= 10;
}

function readNodeText(node: DocumentContent): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
}

function readStringAttr(node: DocumentContent, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readNumberAttr(node: DocumentContent, key: string): number {
  const value = Number(node.attrs?.[key]);
  return Number.isFinite(value) ? value : Number.NaN;
}

function ensureDocContent(content: DocumentContent | null): DocumentContent {
  if (content?.type === 'doc') return content;
  return {
    type: 'doc',
    content: content ? [content] : [{ type: 'paragraph', content: [] }],
  };
}

function transformNode(
  node: DocumentContent,
  enabledCodes: Set<FixableReviewCode>,
): { node: DocumentContent | null; fixes: AppliedFixCounter } {
  const fixes = emptyFixCounter();

  if (
    enabledCodes.has('EXPORT_EMPTY_ENCOUNTER_TABLE')
    && node.type === 'encounterTable'
    && normalizeEncounterEntries(node.attrs?.entries).length === 0
  ) {
    fixes.encounterTablesRemoved += 1;
    return { node: null, fixes };
  }

  if (
    enabledCodes.has('EXPORT_EMPTY_RANDOM_TABLE')
    && node.type === 'randomTable'
    && resolveRandomTableEntries(node.attrs ?? {}).length === 0
  ) {
    fixes.randomTablesRemoved += 1;
    return { node: null, fixes };
  }

  if (
    enabledCodes.has('EXPORT_PLACEHOLDER_STAT_BLOCK')
    && node.type === 'statBlock'
    && isPlaceholderStatBlock(node)
  ) {
    fixes.placeholderStatBlocksRemoved += 1;
    return { node: null, fixes };
  }

  if (
    enabledCodes.has('EXPORT_OVERSIZED_DISPLAY_HEADING')
    && node.type === 'heading'
    && isOversizedDisplayHeading(node)
  ) {
    fixes.oversizedHeadingsDemoted += 1;
    return {
      node: {
        type: 'paragraph',
        attrs: {},
        content: node.content ?? [],
      },
      fixes,
    };
  }

  if (!node.content?.length) {
    return { node, fixes };
  }

  const nextChildren: DocumentContent[] = [];
  for (const child of node.content) {
    const transformed = transformNode(child, enabledCodes);
    mergeFixCounters(fixes, transformed.fixes);
    if (transformed.node) nextChildren.push(transformed.node);
  }

  return {
    node: {
      ...node,
      content: nextChildren,
    },
    fixes,
  };
}

function applySafeFixesToDocument(
  document: ProjectDocumentRecord,
  codes: Set<FixableReviewCode>,
): { content: DocumentContent; fixes: AppliedFixCounter; changed: boolean } {
  const baseContent = ensureDocContent(document.content);
  const transformed = transformNode(baseContent, codes);
  const nextContent = ensureDocContent(transformed.node);
  const changed = JSON.stringify(baseContent) !== JSON.stringify(nextContent);

  if (changed && (!nextContent.content || nextContent.content.length === 0)) {
    nextContent.content = [{ type: 'paragraph', content: [] }];
  }

  return {
    content: nextContent,
    fixes: transformed.fixes,
    changed,
  };
}

function buildFixChanges(title: string, fixes: AppliedFixCounter): ExportReviewFixChange[] {
  const changes: ExportReviewFixChange[] = [];

  if (fixes.encounterTablesRemoved > 0) {
    changes.push({
      code: 'EXPORT_EMPTY_ENCOUNTER_TABLE',
      action: 'remove_empty_encounter_tables',
      title,
      count: fixes.encounterTablesRemoved,
    });
  }

  if (fixes.randomTablesRemoved > 0) {
    changes.push({
      code: 'EXPORT_EMPTY_RANDOM_TABLE',
      action: 'remove_empty_random_tables',
      title,
      count: fixes.randomTablesRemoved,
    });
  }

  if (fixes.placeholderStatBlocksRemoved > 0) {
    changes.push({
      code: 'EXPORT_PLACEHOLDER_STAT_BLOCK',
      action: 'remove_placeholder_stat_blocks',
      title,
      count: fixes.placeholderStatBlocksRemoved,
    });
  }

  if (fixes.oversizedHeadingsDemoted > 0) {
    changes.push({
      code: 'EXPORT_OVERSIZED_DISPLAY_HEADING',
      action: 'demote_oversized_display_headings',
      title,
      count: fixes.oversizedHeadingsDemoted,
    });
  }

  return changes;
}

type RawExportJob = PrismaExportJob & {
  reviewJson: ExportReview | null;
};

export async function applySafeExportReviewFixes(
  exportJob: RawExportJob,
): Promise<Omit<ExportReviewFixResult, 'exportJob'> & { projectId: string; userId: string; format: RawExportJob['format'] }> {
  const review = exportJob.reviewJson;
  if (!review) {
    return {
      status: 'no_review',
      summary: 'This export has no review data to fix from.',
      appliedFixCount: 0,
      documentsUpdated: 0,
      changes: [],
      unsupportedFindingCount: 0,
      projectId: exportJob.projectId,
      userId: exportJob.userId,
      format: exportJob.format,
    };
  }

  const findingsByTitle = new Map<string, Set<FixableReviewCode>>();
  let unsupportedFindingCount = 0;

  for (const finding of review.findings) {
    if (!FIXABLE_CODES.has(finding.code)) {
      unsupportedFindingCount += 1;
      continue;
    }

    const title = getFindingTitle(finding);
    if (!title) {
      unsupportedFindingCount += 1;
      continue;
    }

    const existing = findingsByTitle.get(title) ?? new Set<FixableReviewCode>();
    existing.add(finding.code as FixableReviewCode);
    findingsByTitle.set(title, existing);
  }

  if (findingsByTitle.size === 0) {
    return {
      status: 'no_fixes',
      summary: unsupportedFindingCount > 0
        ? 'No automatic fixes are available for the current export findings.'
        : 'No automatic fixes were needed.',
      appliedFixCount: 0,
      documentsUpdated: 0,
      changes: [],
      unsupportedFindingCount,
      projectId: exportJob.projectId,
      userId: exportJob.userId,
      format: exportJob.format,
    };
  }

  const documents = await prisma.projectDocument.findMany({
    where: { projectId: exportJob.projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      content: true,
    },
  });

  const changes: ExportReviewFixChange[] = [];
  let documentsUpdated = 0;

  await prisma.$transaction(async (tx) => {
    for (const document of documents) {
      const codes = findingsByTitle.get(document.title);
      if (!codes) continue;

      const result = applySafeFixesToDocument({
        id: document.id,
        title: document.title,
        content: document.content as DocumentContent | null,
      }, codes);

      if (!result.changed) continue;

      await tx.projectDocument.update({
        where: { id: document.id },
        data: {
          content: result.content as unknown as Prisma.InputJsonValue,
          status: 'edited',
        },
      });

      documentsUpdated += 1;
      changes.push(...buildFixChanges(document.title, result.fixes));
    }
  });

  const appliedFixCount = changes.reduce((total, change) => total + change.count, 0);

  if (appliedFixCount === 0) {
    return {
      status: 'no_fixes',
      summary: unsupportedFindingCount > 0
        ? 'No automatic fixes could be applied safely. The remaining issues need manual revision.'
        : 'No automatic fixes were applied.',
      appliedFixCount: 0,
      documentsUpdated: 0,
      changes: [],
      unsupportedFindingCount,
      projectId: exportJob.projectId,
      userId: exportJob.userId,
      format: exportJob.format,
    };
  }

  return {
    status: 'started',
    summary: unsupportedFindingCount > 0
      ? `Applied ${appliedFixCount} safe fix${appliedFixCount === 1 ? '' : 'es'} across ${documentsUpdated} document${documentsUpdated === 1 ? '' : 's'}. ${unsupportedFindingCount} issue${unsupportedFindingCount === 1 ? '' : 's'} still need manual revision.`
      : `Applied ${appliedFixCount} safe fix${appliedFixCount === 1 ? '' : 'es'} across ${documentsUpdated} document${documentsUpdated === 1 ? '' : 's'}.`,
    appliedFixCount,
    documentsUpdated,
    changes,
    unsupportedFindingCount,
    projectId: exportJob.projectId,
    userId: exportJob.userId,
    format: exportJob.format,
  };
}
