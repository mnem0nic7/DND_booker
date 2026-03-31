import { analyzePageMetrics } from './layout-analysis.js';
import { getLayoutMeasurementFrame } from './layout-plan.js';
import type { DocumentContent } from './types/document.js';
import type { PageModel, PageModelFragment } from './types/layout-plan.js';
import type { LayoutNodeMetric, PageMetric, PageMetricsSnapshot } from './types/planner.js';

const DEFAULT_PAGE_SIZE: PageMetricsSnapshot['pageSize'] = 'letter';
const NEAR_PAGE_EDGE_THRESHOLD_PX = 96;
const NODE_SUMMARY_LIMIT = 16;
const TEXT_PREVIEW_LIMIT = 80;

function extractTextContent(node: DocumentContent | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content ?? []).map((child) => extractTextContent(child)).join('');
}

function truncateText(text: string, limit = TEXT_PREVIEW_LIMIT): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}\u2026`;
}

function buildNodeLabel(
  nodeType: string,
  textPreview: string | null,
  attrs: Record<string, unknown> | null | undefined,
): string | null {
  if (nodeType === 'heading' && textPreview) {
    return `heading: ${textPreview}`;
  }
  if (nodeType === 'paragraph' && textPreview) {
    return `paragraph: ${textPreview}`;
  }

  const namedAttr = attrs?.name || attrs?.title || attrs?.adventureTitle;
  if (typeof namedAttr === 'string' && namedAttr.trim()) {
    return `${nodeType}: ${truncateText(namedAttr, 60)}`;
  }

  return textPreview ? `${nodeType}: ${textPreview}` : nodeType;
}

function buildNodeSummary(node: LayoutNodeMetric): string {
  const parts = [`[${node.nodeIndex}]`, node.nodeType, `P${node.page}`];
  if (node.column) parts.push(`C${node.column}`);
  if (node.isSplit) parts.push('split');
  if (node.label) parts.push(`"${truncateText(node.label, 50)}"`);
  return parts.join(' ');
}

function getFragmentHeading(fragment: PageModelFragment): string | null {
  if (fragment.nodeType === 'chapterHeader') {
    const title = String(fragment.content.attrs?.title || '').trim();
    return title || null;
  }

  if (fragment.nodeType === 'heading') {
    const title = truncateText(extractTextContent(fragment.content));
    return title || null;
  }

  return null;
}

function getBoundaryType(
  page: PageModel['pages'][number],
  pageIndex: number,
  totalPages: number,
): PageMetric['boundaryType'] {
  if (pageIndex === totalPages - 1) return 'end';
  return page.fragments.some((fragment) => fragment.nodeType === 'pageBreak')
    ? 'pageBreak'
    : 'autoGap';
}

export function buildPageMetricsSnapshotFromPageModel(
  pageModel: PageModel,
  options: {
    documentKind?: string | null;
    documentTitle?: string | null;
    pageSize?: PageMetricsSnapshot['pageSize'];
  } = {},
): PageMetricsSnapshot {
  const frame = getLayoutMeasurementFrame(
    pageModel.preset,
    {
      documentKind: options.documentKind ?? null,
      documentTitle: options.documentTitle ?? null,
    },
    pageModel.flow.sectionRecipe,
  );
  const nodeOccurrences = new Map<number, number>();

  for (const fragment of pageModel.fragments) {
    nodeOccurrences.set(fragment.sourceIndex, (nodeOccurrences.get(fragment.sourceIndex) ?? 0) + 1);
  }

  let currentSectionHeading: string | null = null;
  const nodes = [...pageModel.fragments]
    .sort((left, right) => (
      left.sourceIndex - right.sourceIndex
      || left.pageIndex - right.pageIndex
      || (left.columnIndex ?? 0) - (right.columnIndex ?? 0)
    ))
    .map((fragment): LayoutNodeMetric => {
      const textPreview = truncateText(extractTextContent(fragment.content)) || null;
      const headingLevel = fragment.nodeType === 'heading'
        ? Number(fragment.content.attrs?.level ?? 1)
        : null;
      const sectionHeading = getFragmentHeading(fragment) ?? currentSectionHeading;

      const node: LayoutNodeMetric = {
        nodeIndex: fragment.sourceIndex,
        nodeType: fragment.nodeType,
        page: fragment.pageIndex,
        column: fragment.columnIndex,
        topPx: Math.round(fragment.bounds.y),
        bottomPx: Math.round(fragment.bounds.y + fragment.bounds.height),
        heightPx: Math.max(0, Math.round(fragment.bounds.height)),
        isColumnSpanning: fragment.columnIndex === null
          || fragment.span !== 'column'
          || (fragment.region !== 'column_left' && fragment.region !== 'column_right'),
        isNearPageTop: fragment.bounds.y <= NEAR_PAGE_EDGE_THRESHOLD_PX,
        isNearPageBottom: frame.contentHeightPx - (fragment.bounds.y + fragment.bounds.height) <= NEAR_PAGE_EDGE_THRESHOLD_PX,
        isSplit: (nodeOccurrences.get(fragment.sourceIndex) ?? 0) > 1,
        headingLevel,
        textPreview,
        label: buildNodeLabel(fragment.nodeType, textPreview, fragment.content.attrs as Record<string, unknown> | null | undefined),
        sectionHeading,
      };

      const nextSectionHeading = getFragmentHeading(fragment);
      if (nextSectionHeading) {
        currentSectionHeading = nextSectionHeading;
      }

      return node;
    });

  const nodeLookup = new Map(nodes.map((node) => [node.nodeIndex, node] as const));
  const pages = pageModel.pages.map((page, pageIndex): PageMetric => {
    const nodeIndices = [...new Set(page.fragments.map((fragment) => fragment.sourceIndex))].sort((left, right) => left - right);
    const pageNodes = nodeIndices
      .map((nodeIndex) => nodeLookup.get(nodeIndex))
      .filter((node): node is LayoutNodeMetric => Boolean(node));
    const contentHeight = Math.max(
      0,
      ...page.fragments.map((fragment) => Math.round(fragment.bounds.y + fragment.bounds.height)),
    );
    const fillPercent = Math.min(100, Math.max(0, Math.round((contentHeight / Math.max(1, page.contentHeightPx)) * 100)));
    const firstHeading = page.fragments
      .map((fragment) => getFragmentHeading(fragment))
      .find((value): value is string => Boolean(value)) ?? null;

    return {
      page: page.index,
      contentHeight,
      pageHeight: page.contentHeightPx,
      fillPercent,
      isBlank: fillPercent < 5,
      isNearlyBlank: fillPercent < 15,
      boundaryType: getBoundaryType(page, pageIndex, pageModel.pages.length),
      nodeTypes: pageNodes.slice(0, 10).map((node) => node.nodeType),
      nodeIndices,
      nodeSummaries: pageNodes.slice(0, NODE_SUMMARY_LIMIT).map((node) => buildNodeSummary(node)),
      firstHeading,
    };
  });

  const blankPageCount = pages.filter((page) => page.isBlank).length;
  const nearlyBlankPageCount = pages.filter((page) => page.isNearlyBlank).length;
  const findings = analyzePageMetrics({ pages, nodes });

  return {
    totalPages: pageModel.pages.length,
    pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
    columnCount: frame.columnCount,
    pageContentHeight: frame.contentHeightPx,
    pages,
    blankPageCount,
    nearlyBlankPageCount,
    nodes,
    findings,
  };
}
