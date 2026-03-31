import type { LayoutFinding, LayoutNodeMetric, PageMetric, PageMetricsSnapshot } from './types/planner.js';

const REFERENCE_BLOCK_TYPES = new Set([
  'statBlock',
  'npcProfile',
  'magicItem',
  'spellCard',
  'encounterTable',
  'randomTable',
  'readAloudBox',
  'sidebarCallout',
]);

const VISUAL_BLOCK_TYPES = new Set([
  'fullBleedImage',
  'chapterHeader',
  'titlePage',
  'backCover',
]);

function getRenderableNodes(page: PageMetric, nodeLookup: Map<number, LayoutNodeMetric>): LayoutNodeMetric[] {
  return (page.nodeIndices ?? [])
    .map((idx) => nodeLookup.get(idx))
    .filter((node): node is LayoutNodeMetric => Boolean(node))
    .filter((node) => !['pageBreak', 'columnBreak', 'horizontalRule'].includes(node.nodeType));
}

/**
 * Analyze a rendered page metrics snapshot and derive deterministic layout findings.
 * The goal is to encode obvious layout problems before the model sees the document.
 */
export function analyzePageMetrics(snapshot: Pick<PageMetricsSnapshot, 'pages' | 'nodes'>): LayoutFinding[] {
  const pages = snapshot.pages ?? [];
  const nodes = (snapshot.nodes ?? []).slice().sort((a, b) => a.nodeIndex - b.nodeIndex);
  const findings: LayoutFinding[] = [];
  const nodeLookup = new Map(nodes.map((node) => [node.nodeIndex, node]));

  for (const page of pages) {
    if (page.isBlank) {
      findings.push({
        code: 'blank_page',
        severity: 'warning',
        message: `Page ${page.page} is blank in the rendered layout.`,
        page: page.page,
        nodeIndex: page.nodeIndices?.[0] ?? null,
      });
      continue;
    }

    if (page.isNearlyBlank) {
      const boundaryNodeIndex = page.boundaryType === 'pageBreak'
        ? (page.nodeIndices ?? [])
          .map((idx) => nodeLookup.get(idx))
          .find((node) => node?.nodeType === 'pageBreak')
          ?.nodeIndex ?? null
        : null;
      findings.push({
        code: page.boundaryType === 'pageBreak' ? 'manual_break_nearly_blank_page' : 'nearly_blank_page',
        severity: 'warning',
        message: page.boundaryType === 'pageBreak'
          ? `Page ${page.page} is nearly blank and ends with a manual page break.`
          : `Page ${page.page} is nearly blank in the rendered layout.`,
        page: page.page,
        nodeIndex: boundaryNodeIndex ?? page.nodeIndices?.[0] ?? null,
      });
    }

    const renderableNodes = getRenderableNodes(page, nodeLookup);
    if (renderableNodes.length === 1) {
      const onlyNode = renderableNodes[0];

      if (REFERENCE_BLOCK_TYPES.has(onlyNode.nodeType) && !page.firstHeading) {
        findings.push({
          code: 'isolated_reference_block',
          severity: 'info',
          message: `${onlyNode.nodeType} at node ${onlyNode.nodeIndex} is isolated on page ${page.page} without a local heading.`,
          page: page.page,
          nodeIndex: onlyNode.nodeIndex,
        });
      }

      if (VISUAL_BLOCK_TYPES.has(onlyNode.nodeType) && page.isNearlyBlank) {
        findings.push({
          code: 'isolated_visual_block',
          severity: 'info',
          message: `${onlyNode.nodeType} at node ${onlyNode.nodeIndex} dominates page ${page.page} with little surrounding content.`,
          page: page.page,
          nodeIndex: onlyNode.nodeIndex,
        });
      }
    }
  }

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nextNode = nodes[i + 1];

    if (node.nodeType === 'pageBreak' && nextNode?.nodeType === 'pageBreak') {
      findings.push({
        code: 'consecutive_page_breaks',
        severity: 'warning',
        message: `Consecutive page breaks at nodes ${node.nodeIndex} and ${nextNode.nodeIndex}.`,
        page: node.page,
        nodeIndex: node.nodeIndex,
      });
    }

    if (node.nodeType === 'heading' && node.headingLevel === 1 && !node.isNearPageTop) {
      findings.push({
        code: 'chapter_heading_mid_page',
        severity: 'warning',
        message: `Heading at node ${node.nodeIndex} starts mid-page instead of near the top of page ${node.page}.`,
        page: node.page,
        nodeIndex: node.nodeIndex,
      });
    }

    if (node.isSplit && REFERENCE_BLOCK_TYPES.has(node.nodeType)) {
      findings.push({
        code: 'split_reference_block',
        severity: 'info',
        message: `${node.nodeType} at node ${node.nodeIndex} spans a page boundary.`,
        page: node.page,
        nodeIndex: node.nodeIndex,
      });
    }
  }

  return findings;
}
