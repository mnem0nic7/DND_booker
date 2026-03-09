import type { Editor } from '@tiptap/core';
import { analyzePageMetrics, type LayoutNodeMetric, type PageMetric, type PageMetricsSnapshot } from '@dnd-booker/shared';

const DEFAULT_PAGE_CONTENT_HEIGHT = 864;
const NEAR_PAGE_EDGE_THRESHOLD_PX = 96;
const NODE_SUMMARY_LIMIT = 16;
const TEXT_PREVIEW_LIMIT = 80;

const COLUMN_SPANNING_TYPES = new Set([
  'pageBreak',
  'titlePage',
  'creditsPage',
  'backCover',
  'tableOfContents',
  'chapterHeader',
  'fullBleedImage',
]);

/** Read --page-content-height from .page-canvas via computed style. */
function getPageContentHeight(pmEl: HTMLElement): number {
  const canvas = pmEl.closest('.page-canvas') as HTMLElement | null;
  if (!canvas) return DEFAULT_PAGE_CONTENT_HEIGHT;
  const raw = getComputedStyle(canvas).getPropertyValue('--page-content-height').trim();
  return parseInt(raw, 10) || DEFAULT_PAGE_CONTENT_HEIGHT;
}

/** Read the data-page-size attribute (defaults to 'letter'). */
function getPageSize(pmEl: HTMLElement): 'letter' | 'a4' | 'a5' {
  const canvas = pmEl.closest('.page-canvas') as HTMLElement | null;
  const size = canvas?.getAttribute('data-page-size');
  if (size === 'a4' || size === 'a5') return size;
  return 'letter';
}

/** Read CSS column-count from the ProseMirror element. */
function getColumnCount(pmEl: HTMLElement): number {
  return parseInt(getComputedStyle(pmEl).columnCount, 10) || 1;
}

interface Boundary {
  y: number;
  type: 'pageBreak' | 'autoGap' | 'start';
}

interface PageRegion {
  page: number;
  top: number;
  bottom: number;
  boundaryType: PageMetric['boundaryType'];
}

function truncateText(text: string, limit = TEXT_PREVIEW_LIMIT): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1))}\u2026`;
}

function inferColumn(
  rect: DOMRect,
  pmRect: DOMRect,
  columnCount: number,
  isColumnSpanning: boolean,
): number | null {
  if (isColumnSpanning || columnCount <= 1) return isColumnSpanning ? null : 1;
  const relativeLeft = Math.max(0, rect.left - pmRect.left);
  const estimatedColumnWidth = pmRect.width / columnCount;
  const rawColumn = Math.floor(relativeLeft / Math.max(1, estimatedColumnWidth)) + 1;
  return Math.min(columnCount, Math.max(1, rawColumn));
}

function getRegionIndex(y: number, regions: PageRegion[]): number {
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (y >= region.top && y < region.bottom) return i;
  }
  return Math.max(0, regions.length - 1);
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

/**
 * Collect actual rendered page metrics from the live editor DOM.
 *
 * Walks page boundaries (.node-pageBreak and .auto-page-gap), measures
 * content height between them, and identifies node types on each page.
 */
export function collectPageMetrics(editor: Editor): PageMetricsSnapshot {
  const view = editor.view;
  const pmEl = view.dom as HTMLElement;
  const pageContentHeight = getPageContentHeight(pmEl);
  const pageSize = getPageSize(pmEl);
  const columnCount = getColumnCount(pmEl);

  const pmRect = pmEl.getBoundingClientRect();

  // Gather all boundary elements sorted by Y position
  const boundaries: Boundary[] = [{ y: pmRect.top, type: 'start' }];

  const pageBreaks = pmEl.querySelectorAll<HTMLElement>('.node-pageBreak');
  for (const el of pageBreaks) {
    const rect = el.getBoundingClientRect();
    boundaries.push({ y: rect.top, type: 'pageBreak' });
  }

  const autoGaps = pmEl.querySelectorAll<HTMLElement>('.auto-page-gap');
  for (const el of autoGaps) {
    const rect = el.getBoundingClientRect();
    boundaries.push({ y: rect.top, type: 'autoGap' });
  }

  boundaries.sort((a, b) => a.y - b.y);

  const pageRegions: PageRegion[] = boundaries.map((boundary, index) => ({
    page: index + 1,
    top: boundary.y,
    bottom: index + 1 < boundaries.length ? boundaries[index + 1].y : pmRect.bottom,
    boundaryType: index + 1 < boundaries.length
      ? boundaries[index + 1].type === 'pageBreak'
        ? 'pageBreak'
        : 'autoGap'
      : 'end',
  }));

  const nodeInfos: LayoutNodeMetric[] = [];
  const { doc } = view.state;
  let currentSectionHeading: string | null = null;
  let nodeIndex = 0;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    const currentIndex = nodeIndex++;
    if (!dom) return;
    const rect = dom.getBoundingClientRect();
    const nodeType = node.type.name;
    const textPreview = truncateText(node.textContent || '') || null;
    const headingLevel = nodeType === 'heading'
      ? Number((node.attrs as { level?: number } | null | undefined)?.level ?? 1)
      : null;
    const topRegionIndex = getRegionIndex(rect.top, pageRegions);
    const bottomRegionIndex = getRegionIndex(Math.max(rect.top, rect.bottom - 1), pageRegions);
    const region = pageRegions[topRegionIndex];
    const isColumnSpanning = COLUMN_SPANNING_TYPES.has(nodeType);
    const sectionHeading = nodeType === 'heading' ? textPreview : currentSectionHeading;

    nodeInfos.push({
      nodeIndex: currentIndex,
      nodeType,
      page: region.page,
      column: inferColumn(rect, pmRect, columnCount, isColumnSpanning),
      topPx: Math.round(rect.top - pmRect.top),
      bottomPx: Math.round(rect.bottom - pmRect.top),
      heightPx: Math.max(0, Math.round(rect.height)),
      isColumnSpanning,
      isNearPageTop: rect.top - region.top <= NEAR_PAGE_EDGE_THRESHOLD_PX,
      isNearPageBottom: region.bottom - rect.bottom <= NEAR_PAGE_EDGE_THRESHOLD_PX,
      isSplit: topRegionIndex !== bottomRegionIndex,
      headingLevel,
      textPreview,
      label: buildNodeLabel(nodeType, textPreview, node.attrs as Record<string, unknown> | null | undefined),
      sectionHeading,
    });

    if (nodeType === 'heading' && textPreview) {
      currentSectionHeading = textPreview;
    }
  });

  // For each region between consecutive boundaries, build a PageMetric
  const pages: PageMetric[] = [];
  let blankCount = 0;
  let nearlyBlankCount = 0;

  for (let i = 0; i < boundaries.length; i++) {
    const regionTop = boundaries[i].y;
    const regionBottom = i + 1 < boundaries.length
      ? boundaries[i + 1].y
      : pmRect.bottom;

    const contentHeight = Math.max(0, Math.round(regionBottom - regionTop));
    const fillPercent = Math.round((contentHeight / pageContentHeight) * 100);
    const isBlank = fillPercent < 5;
    const isNearlyBlank = fillPercent < 15;

    const regionNodes = nodeInfos.filter((n) => n.page === i + 1);
    const nodeTypes = regionNodes.slice(0, 10).map((n) => n.nodeType);
    const firstHeading = regionNodes.find((n) => n.nodeType === 'heading')?.textPreview ?? null;

    if (isBlank) blankCount++;
    if (isNearlyBlank) nearlyBlankCount++;

    pages.push({
      page: i + 1,
      contentHeight,
      pageHeight: pageContentHeight,
      fillPercent,
      isBlank,
      isNearlyBlank,
      boundaryType: pageRegions[i]?.boundaryType ?? 'end',
      nodeTypes,
      nodeIndices: regionNodes.map((n) => n.nodeIndex),
      nodeSummaries: regionNodes.slice(0, NODE_SUMMARY_LIMIT).map(buildNodeSummary),
      firstHeading,
    });
  }

  const findings = analyzePageMetrics({
    pages,
    nodes: nodeInfos,
  });

  return {
    totalPages: pages.length,
    pageSize,
    columnCount,
    pageContentHeight,
    pages,
    blankPageCount: blankCount,
    nearlyBlankPageCount: nearlyBlankCount,
    nodes: nodeInfos,
    findings,
  };
}
