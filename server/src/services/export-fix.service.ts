import type { Prisma } from '@prisma/client';
import type {
  DocumentContent,
  ExportReview,
  ExportReviewCode,
  ExportReviewFixChange,
  ExportReviewFixResult,
  LayoutPlan,
} from '@dnd-booker/shared';
import {
  assessStatBlockAttrs,
  hasEncounterTableContent,
  recommendLayoutPlan,
  resolveRandomTableEntries,
} from '@dnd-booker/shared';
import type { ExportJob as PrismaExportJob } from '@prisma/client';
import { prisma } from '../config/database.js';
import {
  applyPublicationPolishEdits,
  derivePublicationPolishEdits,
} from './generation/publication-polish.helpers.js';
import { buildResolvedPublicationDocumentWriteData } from './document-publication.service.js';
import { resolveDocumentLayout } from './layout-plan.service.js';
import { materializeSparsePageArt, realizeSparsePageArt } from './layout-art.service.js';
import { rebuildProjectContentCache } from './project-document-content.service.js';

const CONTENT_FIXABLE_CODES = new Set<ExportReviewCode>([
  'EXPORT_EMPTY_ENCOUNTER_TABLE',
  'EXPORT_EMPTY_RANDOM_TABLE',
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_OVERSIZED_DISPLAY_HEADING',
]);

const LAYOUT_REFRESH_CODES = new Set<ExportReviewCode>([
  'EXPORT_CHAPTER_OPENER_LOW',
  'EXPORT_SECTION_TITLE_WRAP',
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_MISSED_ART_OPPORTUNITY',
  'EXPORT_WEAK_HERO_PLACEMENT',
  'EXPORT_SPLIT_SCENE_PACKET',
  'EXPORT_UNBALANCED_COLUMNS',
  'EXPORT_MARGIN_COLLISION',
  'EXPORT_FOOTER_COLLISION',
  'EXPORT_ORPHAN_TAIL_PARAGRAPH',
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

const PARITY_REVIEW_CODES = new Set<ExportReviewCode>([
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

const PARITY_MANUAL_BREAK_CODES = new Set<ExportReviewCode>([
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
]);

const PARITY_FALLBACK_CODES = new Set<ExportReviewCode>([
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

const ART_DRIVEN_LAYOUT_CODES = new Set<LayoutRefreshReviewCode>([
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_MISSED_ART_OPPORTUNITY',
  'EXPORT_UNBALANCED_COLUMNS',
  'EXPORT_SPLIT_SCENE_PACKET',
]);

type ContentFixableReviewCode = typeof CONTENT_FIXABLE_CODES extends Set<infer T> ? T : never;
type LayoutRefreshReviewCode = typeof LAYOUT_REFRESH_CODES extends Set<infer T> ? T : never;
type ParityReviewCode = typeof PARITY_REVIEW_CODES extends Set<infer T> ? T : never;

type ProjectDocumentRecord = {
  id: string;
  title: string;
  kind?: string | null;
  layoutPlan?: unknown;
  content: DocumentContent | null;
  canonicalVersion?: number | null;
  editorProjectionVersion?: number | null;
  typstVersion?: number | null;
};

type AppliedFixCounter = {
  encounterTablesRemoved: number;
  randomTablesRemoved: number;
  placeholderStatBlocksRemoved: number;
  oversizedHeadingsDemoted: number;
};

type PublicationPolishSignal = {
  code: 'MANUAL_BREAK_NEARLY_BLANK_PAGE' | 'CHAPTER_HEADING_MID_PAGE';
  affectedScope: string;
};

type ParityFixState = {
  codes: Set<ParityReviewCode>;
  fallbackScopeIds: Set<string>;
  publicationPolishSignals: PublicationPolishSignal[];
};

function emptyFixCounter(): AppliedFixCounter {
  return {
    encounterTablesRemoved: 0,
    randomTablesRemoved: 0,
    placeholderStatBlocksRemoved: 0,
    oversizedHeadingsDemoted: 0,
  };
}

function emptyParityFixState(): ParityFixState {
  return {
    codes: new Set<ParityReviewCode>(),
    fallbackScopeIds: new Set<string>(),
    publicationPolishSignals: [],
  };
}

function mergeFixCounters(target: AppliedFixCounter, source: AppliedFixCounter) {
  target.encounterTablesRemoved += source.encounterTablesRemoved;
  target.randomTablesRemoved += source.randomTablesRemoved;
  target.placeholderStatBlocksRemoved += source.placeholderStatBlocksRemoved;
  target.oversizedHeadingsDemoted += source.oversizedHeadingsDemoted;
}

function getFindingTitle(
  finding: ExportReview['findings'][number],
  review: ExportReview,
): string | null {
  const detailsTitle = finding.details && typeof finding.details === 'object'
    ? (finding.details as Record<string, unknown>).title
    : null;
  if (typeof detailsTitle === 'string' && detailsTitle.trim().length > 0) {
    return detailsTitle.trim();
  }

  if (typeof finding.page !== 'number' || !Number.isFinite(finding.page)) {
    return null;
  }

  const sectionStarts = [...(review.metrics.sectionStarts ?? [])]
    .filter((section) => typeof section.title === 'string' && section.title.trim().length > 0 && typeof section.page === 'number')
    .sort((left, right) => (left.page ?? Number.MAX_SAFE_INTEGER) - (right.page ?? Number.MAX_SAFE_INTEGER));

  let matchedTitle: string | null = null;
  for (const section of sectionStarts) {
    if ((section.page ?? Number.MAX_SAFE_INTEGER) <= finding.page) {
      matchedTitle = section.title.trim();
      continue;
    }
    break;
  }

  return matchedTitle;
}

function getFindingDetails(
  finding: ExportReview['findings'][number],
): Record<string, unknown> | null {
  return finding.details && typeof finding.details === 'object'
    ? finding.details as Record<string, unknown>
    : null;
}

function getFindingDocumentId(
  finding: ExportReview['findings'][number],
): string | null {
  const details = getFindingDetails(finding);
  const documentId = details?.documentId;
  return typeof documentId === 'string' && documentId.trim().length > 0
    ? documentId.trim()
    : null;
}

function normalizeFallbackScopeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((scopeId): scopeId is string => typeof scopeId === 'string' && /^(group|unit):.+$/.test(scopeId))
      .map((scopeId) => scopeId.trim())
      .filter(Boolean),
  )];
}

function extractParityFixState(finding: ExportReview['findings'][number]): ParityFixState {
  const state = emptyParityFixState();
  state.codes.add(finding.code as ParityReviewCode);

  const details = getFindingDetails(finding);
  const scopeIds = normalizeFallbackScopeIds(details?.scopeIds);
  for (const scopeId of scopeIds) {
    state.fallbackScopeIds.add(scopeId);
  }

  const layoutFindings = Array.isArray(details?.layoutFindings) ? details.layoutFindings : [];
  for (const entry of layoutFindings) {
    if (!entry || typeof entry !== 'object') continue;
    const layoutFinding = entry as Record<string, unknown>;
    const nodeIndex = Number(layoutFinding.nodeIndex);
    if (!Number.isInteger(nodeIndex) || nodeIndex < 0) continue;

    if (layoutFinding.code === 'manual_break_nearly_blank_page') {
      state.publicationPolishSignals.push({
        code: 'MANUAL_BREAK_NEARLY_BLANK_PAGE',
        affectedScope: `node-${nodeIndex}`,
      });
    } else if (layoutFinding.code === 'chapter_heading_mid_page') {
      state.publicationPolishSignals.push({
        code: 'CHAPTER_HEADING_MID_PAGE',
        affectedScope: `node-${nodeIndex}`,
      });
    }
  }

  return state;
}

function mergeParityFixState(target: ParityFixState, source: ParityFixState) {
  for (const code of source.codes) target.codes.add(code);
  for (const scopeId of source.fallbackScopeIds) target.fallbackScopeIds.add(scopeId);
  target.publicationPolishSignals.push(...source.publicationPolishSignals);
}

function normalizeTextLayoutFallbacks(
  settings: unknown,
): Record<string, { scopeIds: string[] }> {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  const raw = (settings as Record<string, unknown>).textLayoutFallbacks;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([documentId, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const scopeIds = normalizeFallbackScopeIds((entry as { scopeIds?: unknown }).scopeIds);
      return scopeIds.length > 0 ? [[documentId, { scopeIds }]] : [];
    }),
  );
}

function isPlaceholderStatBlock(node: DocumentContent): boolean {
  return assessStatBlockAttrs(node.attrs ?? {}).isPlaceholder;
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
  enabledCodes: Set<ContentFixableReviewCode>,
): { node: DocumentContent | null; fixes: AppliedFixCounter } {
  const fixes = emptyFixCounter();

  if (
    enabledCodes.has('EXPORT_EMPTY_ENCOUNTER_TABLE')
    && node.type === 'encounterTable'
    && !hasEncounterTableContent(node.attrs ?? {})
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
  codes: Set<ContentFixableReviewCode>,
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

function buildLayoutRefreshChanges(
  title: string,
  codes: Set<LayoutRefreshReviewCode>,
): ExportReviewFixChange[] {
  return Array.from(codes).sort().map((code) => ({
    code,
    action: 'refresh_layout_plan' as const,
    title,
    count: 1,
  }));
}

function buildSpotArtChanges(
  title: string,
  codes: Set<LayoutRefreshReviewCode>,
  count: number,
): ExportReviewFixChange[] {
  if (count <= 0) return [];
  const drivingCodes = Array.from(codes).filter((code) => ART_DRIVEN_LAYOUT_CODES.has(code)).sort();
  if (drivingCodes.length === 0) return [];

  return [{
    code: drivingCodes[0],
    action: 'generate_spot_art',
    title,
    count,
  }];
}

function buildPageBreakNormalizationChanges(
  title: string,
  count: number,
): ExportReviewFixChange[] {
  if (count <= 0) return [];
  return [{
    code: 'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
    action: 'normalize_page_breaks',
    title,
    count,
  }];
}

function buildFallbackConfigurationChanges(
  title: string,
  count: number,
): ExportReviewFixChange[] {
  if (count <= 0) return [];
  return [{
    code: 'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
    action: 'configure_text_layout_fallbacks',
    title,
    count,
  }];
}

function layoutPlanChanged(previous: unknown, next: LayoutPlan | null): boolean {
  return JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null);
}

function normalizePageBreaksInDocument(
  content: DocumentContent | null,
  parityState: ParityFixState | null,
): { content: DocumentContent; changed: boolean; editCount: number } {
  const baseContent = ensureDocContent(content);
  const signals = parityState?.publicationPolishSignals ?? [];
  const edits = derivePublicationPolishEdits(baseContent, signals);
  if (edits.length === 0) {
    return {
      content: baseContent,
      changed: false,
      editCount: 0,
    };
  }

  const nextContent = ensureDocContent(applyPublicationPolishEdits(baseContent, edits) as DocumentContent);
  return {
    content: nextContent,
    changed: JSON.stringify(baseContent) !== JSON.stringify(nextContent),
    editCount: edits.length,
  };
}

type RawExportJob = PrismaExportJob & {
  reviewJson: ExportReview | null;
};

export async function applySafeExportReviewFixes(
  exportJob: RawExportJob,
  options: {
    allowedCodes?: Set<ExportReviewCode>;
    targetTitle?: string | null;
  } = {},
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

  const findings = review.findings.filter((finding) => (
    !options.allowedCodes || options.allowedCodes.has(finding.code)
  ));
  const contentFindingsByTitle = new Map<string, Set<ContentFixableReviewCode>>();
  const layoutFindingsByTitle = new Map<string, Set<LayoutRefreshReviewCode>>();
  const parityFindingsByDocumentId = new Map<string, ParityFixState>();
  let unsupportedFindingCount = 0;

  for (const finding of findings) {
    const title = getFindingTitle(finding, review);
    if (options.targetTitle && title !== options.targetTitle) {
      continue;
    }

    if (PARITY_REVIEW_CODES.has(finding.code)) {
      const documentId = getFindingDocumentId(finding);
      if (!documentId) {
        unsupportedFindingCount += 1;
        continue;
      }

      const existing = parityFindingsByDocumentId.get(documentId) ?? emptyParityFixState();
      mergeParityFixState(existing, extractParityFixState(finding));
      parityFindingsByDocumentId.set(documentId, existing);
    }

    if (!title) {
      if (PARITY_REVIEW_CODES.has(finding.code)) {
        continue;
      }
      unsupportedFindingCount += 1;
      continue;
    }

    if (CONTENT_FIXABLE_CODES.has(finding.code)) {
      const existing = contentFindingsByTitle.get(title) ?? new Set<ContentFixableReviewCode>();
      existing.add(finding.code as ContentFixableReviewCode);
      contentFindingsByTitle.set(title, existing);
      continue;
    }

    if (LAYOUT_REFRESH_CODES.has(finding.code)) {
      const existing = layoutFindingsByTitle.get(title) ?? new Set<LayoutRefreshReviewCode>();
      existing.add(finding.code as LayoutRefreshReviewCode);
      layoutFindingsByTitle.set(title, existing);
      continue;
    }

    unsupportedFindingCount += 1;
  }

  if (contentFindingsByTitle.size === 0 && layoutFindingsByTitle.size === 0 && parityFindingsByDocumentId.size === 0) {
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

  const project = await prisma.project.findUnique({
    where: { id: exportJob.projectId },
    select: { settings: true },
  });
  const documents = await prisma.projectDocument.findMany({
    where: {
      projectId: exportJob.projectId,
      ...(options.targetTitle ? { title: options.targetTitle } : {}),
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      title: true,
      kind: true,
      layoutPlan: true,
      content: true,
      canonicalVersion: true,
      editorProjectionVersion: true,
      typstVersion: true,
    },
  });

  const changes: ExportReviewFixChange[] = [];
  let documentsUpdated = 0;
  let fallbackConfigChanged = false;
  const projectTextLayoutFallbacks = normalizeTextLayoutFallbacks(project?.settings);
  const fallbackChangeCounts = new Map<string, number>();

  const pendingUpdates: Array<{
    id: string;
    title: string;
    nextContent: DocumentContent;
    nextLayoutPlan: LayoutPlan | null;
    nextFixes: AppliedFixCounter;
    layoutCodes: Set<LayoutRefreshReviewCode> | null;
    contentChanged: boolean;
    layoutChanged: boolean;
    generatedSpotArtCount: number;
    pageBreakEditCount: number;
    fallbackScopeCount: number;
  }> = [];

  for (const document of documents) {
    const contentCodes = contentFindingsByTitle.get(document.title) ?? null;
    const layoutCodes = layoutFindingsByTitle.get(document.title) ?? null;
    const parityState = parityFindingsByDocumentId.get(document.id) ?? null;
    if (!contentCodes && !layoutCodes && !parityState) continue;

    const baseContent = document.content as DocumentContent | null;
    let nextContent = ensureDocContent(baseContent);
    let nextLayoutPlan = document.layoutPlan as LayoutPlan | null;
    let contentChanged = false;
    let nextFixes = emptyFixCounter();
    let generatedSpotArtCount = 0;
    let pageBreakEditCount = 0;
    let fallbackScopeCount = 0;

    if (parityState && Array.from(parityState.codes).some((code) => PARITY_MANUAL_BREAK_CODES.has(code))) {
      const normalized = normalizePageBreaksInDocument(baseContent, parityState);
      nextContent = normalized.content;
      contentChanged = normalized.changed;
      pageBreakEditCount = normalized.editCount;
    }

    if (contentCodes) {
      const safeResult = applySafeFixesToDocument({
        id: document.id,
        title: document.title,
        kind: document.kind,
        content: nextContent,
        layoutPlan: document.layoutPlan ?? null,
      }, contentCodes);
      nextContent = safeResult.content;
      nextFixes = safeResult.fixes;
      contentChanged = contentChanged || safeResult.changed;
    }

    if (layoutCodes && Array.from(layoutCodes).some((code) => ART_DRIVEN_LAYOUT_CODES.has(code))) {
      const artAugmented = materializeSparsePageArt({
        content: nextContent,
        kind: document.kind,
        title: document.title,
        reviewCodes: Array.from(layoutCodes),
      });
      if (artAugmented.changed) {
        nextContent = artAugmented.content;
        contentChanged = true;
        const realizedArt = await realizeSparsePageArt({
          projectId: exportJob.projectId,
          userId: exportJob.userId,
          content: artAugmented.content,
          insertedNodeIds: artAugmented.insertedNodeIds,
        });

        if (realizedArt.changed) {
          nextContent = realizedArt.content;
          generatedSpotArtCount = realizedArt.generatedCount;
        }
      }
    }

    if (parityState && Array.from(parityState.codes).some((code) => PARITY_FALLBACK_CODES.has(code))) {
      const existingScopeIds = new Set(projectTextLayoutFallbacks[document.id]?.scopeIds ?? []);
      const previousCount = existingScopeIds.size;
      for (const scopeId of parityState.fallbackScopeIds) {
        existingScopeIds.add(scopeId);
      }
      const nextScopeIds = [...existingScopeIds].sort();
      if (nextScopeIds.length > 0 && JSON.stringify(nextScopeIds) !== JSON.stringify(projectTextLayoutFallbacks[document.id]?.scopeIds ?? [])) {
        projectTextLayoutFallbacks[document.id] = { scopeIds: nextScopeIds };
        fallbackConfigChanged = true;
        fallbackScopeCount = nextScopeIds.length - previousCount;
        fallbackChangeCounts.set(document.id, fallbackScopeCount);
      }
    }

    const resolvedLayout = resolveDocumentLayout({
      content: nextContent,
      layoutPlan: nextLayoutPlan,
      kind: document.kind,
      title: document.title,
    });
    nextContent = resolvedLayout.content;
    nextLayoutPlan = resolvedLayout.layoutPlan;

    let layoutChanged = layoutPlanChanged(document.layoutPlan, nextLayoutPlan)
      || JSON.stringify(baseContent) !== JSON.stringify(nextContent);

    if (layoutCodes) {
      const recommendedLayout = recommendLayoutPlan(nextContent, nextLayoutPlan, {
        documentKind: document.kind ?? null,
        documentTitle: document.title,
        reviewCodes: Array.from(layoutCodes),
      });
      if (layoutPlanChanged(nextLayoutPlan, recommendedLayout)) {
        nextLayoutPlan = recommendedLayout;
        layoutChanged = true;
      }
    }

    if (!contentChanged && !layoutChanged) continue;

    pendingUpdates.push({
      id: document.id,
      title: document.title,
      nextContent,
      nextLayoutPlan,
      nextFixes,
      layoutCodes,
      contentChanged,
      layoutChanged,
      generatedSpotArtCount,
      pageBreakEditCount,
      fallbackScopeCount,
    });
  }

  await prisma.$transaction(async (tx) => {
    if (fallbackConfigChanged && project) {
      await tx.project.update({
        where: { id: exportJob.projectId },
        data: {
          settings: {
            ...(((project.settings as Record<string, unknown> | null) ?? {})),
            textLayoutFallbacks: projectTextLayoutFallbacks,
          } as Prisma.InputJsonValue,
        },
      });
    }

    for (const update of pendingUpdates) {
      await tx.projectDocument.update({
        where: { id: update.id },
        data: {
          ...buildResolvedPublicationDocumentWriteData({
            content: update.nextContent,
            layoutPlan: update.nextLayoutPlan,
            kind: documents.find((document) => document.id === update.id)?.kind ?? null,
            title: update.title,
            versions: {
              canonicalVersion: documents.find((document) => document.id === update.id)?.canonicalVersion,
              editorProjectionVersion: documents.find((document) => document.id === update.id)?.editorProjectionVersion,
              typstVersion: documents.find((document) => document.id === update.id)?.typstVersion,
            },
            bumpVersions: update.contentChanged,
          }),
          status: 'edited',
        },
      });

      documentsUpdated += 1;
      changes.push(...buildFixChanges(update.title, update.nextFixes));
      changes.push(...buildPageBreakNormalizationChanges(update.title, update.pageBreakEditCount));
      changes.push(...buildFallbackConfigurationChanges(update.title, update.fallbackScopeCount));
      if (update.layoutCodes && update.generatedSpotArtCount > 0) {
        changes.push(...buildSpotArtChanges(update.title, update.layoutCodes, update.generatedSpotArtCount));
      }
      if (update.layoutCodes && update.layoutChanged) {
        changes.push(...buildLayoutRefreshChanges(update.title, update.layoutCodes));
      }
    }

    if (pendingUpdates.length > 0) {
      await rebuildProjectContentCache(exportJob.projectId, tx);
    }
  });

  if (fallbackConfigChanged) {
    const pendingDocumentIds = new Set(pendingUpdates.map((update) => update.id));
    for (const document of documents) {
      if (pendingDocumentIds.has(document.id)) continue;
      const addedScopeCount = fallbackChangeCounts.get(document.id) ?? 0;
      if (addedScopeCount <= 0) continue;
      changes.push(...buildFallbackConfigurationChanges(document.title, addedScopeCount));
    }
  }

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
      ? `Applied ${appliedFixCount} automatic fix${appliedFixCount === 1 ? '' : 'es'} across ${documentsUpdated} document${documentsUpdated === 1 ? '' : 's'}. ${unsupportedFindingCount} issue${unsupportedFindingCount === 1 ? '' : 's'} still need manual revision.`
      : `Applied ${appliedFixCount} automatic fix${appliedFixCount === 1 ? '' : 'es'} across ${documentsUpdated} document${documentsUpdated === 1 ? '' : 's'}.`,
    appliedFixCount,
    documentsUpdated,
    changes,
    unsupportedFindingCount,
    projectId: exportJob.projectId,
    userId: exportJob.userId,
    format: exportJob.format,
  };
}
