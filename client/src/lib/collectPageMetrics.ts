import type { Editor } from '@tiptap/core';
import type { PageMetric, PageMetricsSnapshot } from '@dnd-booker/shared';

const DEFAULT_PAGE_CONTENT_HEIGHT = 864;

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

  // Build a map of Y-position → node type for top-level nodes
  interface NodeInfo {
    y: number;
    typeName: string;
    headingText: string | null;
  }

  const nodeInfos: NodeInfo[] = [];
  const { doc } = view.state;

  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (!dom) return;
    const rect = dom.getBoundingClientRect();

    let headingText: string | null = null;
    if (node.type.name === 'heading') {
      headingText = node.textContent.slice(0, 60) || null;
    }

    nodeInfos.push({
      y: rect.top,
      typeName: node.type.name,
      headingText,
    });
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

    // Determine boundary type (what ends this page region)
    let boundaryType: PageMetric['boundaryType'] = 'end';
    if (i + 1 < boundaries.length) {
      boundaryType = boundaries[i + 1].type === 'pageBreak' ? 'pageBreak' : 'autoGap';
    }

    // Find nodes whose Y falls within this region
    const regionNodes = nodeInfos.filter(
      (n) => n.y >= regionTop && n.y < regionBottom,
    );
    const nodeTypes = regionNodes.slice(0, 10).map((n) => n.typeName);
    const firstHeading = regionNodes.find((n) => n.headingText)?.headingText ?? null;

    if (isBlank) blankCount++;
    if (isNearlyBlank) nearlyBlankCount++;

    pages.push({
      page: i + 1,
      contentHeight,
      pageHeight: pageContentHeight,
      fillPercent,
      isBlank,
      isNearlyBlank,
      boundaryType,
      nodeTypes,
      firstHeading,
    });
  }

  return {
    totalPages: pages.length,
    pageSize,
    columnCount,
    pageContentHeight,
    pages,
    blankPageCount: blankCount,
    nearlyBlankPageCount: nearlyBlankCount,
  };
}
