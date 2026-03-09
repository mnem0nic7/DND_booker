import type { EvaluationFinding } from '@dnd-booker/shared';

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

interface EstimatedPageSummary {
  page: number;
  fillPercent: number;
  boundary: 'pageBreak' | 'auto' | 'end';
}

export interface EstimatedLayoutAnalysis {
  estimatedPages: number;
  pageSummaries: EstimatedPageSummary[];
  findings: EvaluationFinding[];
  summary: string;
}

const PAGE_HEIGHT = 864;
const LINE_HEIGHT = 17;
const CHARS_PER_COL_LINE = 40;

const COLUMN_SPANNING_TYPES = new Set([
  'titlePage',
  'creditsPage',
  'backCover',
  'tableOfContents',
  'chapterHeader',
  'fullBleedImage',
  'pageBreak',
  'columnBreak',
]);

const REFERENCE_BLOCK_TYPES = new Set([
  'statBlock',
  'npcProfile',
  'magicItem',
  'spellCard',
  'randomTable',
  'encounterTable',
  'readAloud',
  'readAloudBox',
  'dmTips',
  'sidebarCallout',
]);

function extractTextContent(node: TipTapNode): string {
  if (node.text) return node.text;
  if (!node.content) return '';
  return node.content.map(extractTextContent).join('');
}

function countEntries(entries: unknown): number {
  if (typeof entries === 'string') {
    try {
      const parsed = JSON.parse(entries);
      return Array.isArray(parsed) ? parsed.length : 4;
    } catch {
      return 4;
    }
  }
  if (Array.isArray(entries)) return entries.length;
  return 4;
}

function estimateNodeHeight(node: TipTapNode): number {
  const textLen = extractTextContent(node).length;
  const textLines = Math.max(1, Math.ceil(textLen / CHARS_PER_COL_LINE));

  switch (node.type) {
    case 'paragraph':
      if (!textLen) return 20;
      return textLines * LINE_HEIGHT + 6;
    case 'heading': {
      const sizes: Record<number, number> = { 1: 50, 2: 40, 3: 32, 4: 28 };
      return sizes[(node.attrs?.level as number) || 1] || 28;
    }
    case 'pageBreak': return 56;
    case 'horizontalRule': return 40;
    case 'columnBreak': return 0;
    case 'statBlock': return 300 + Math.min(textLines * 8, 300);
    case 'spellCard': return 180 + Math.min(textLines * 8, 200);
    case 'magicItem': return 160 + Math.min(textLines * 8, 200);
    case 'npcProfile': return 250;
    case 'randomTable': return 80 + countEntries(node.attrs?.entries) * 24;
    case 'encounterTable': return 80 + countEntries(node.attrs?.entries) * 24;
    case 'sidebarCallout': return 100 + textLines * LINE_HEIGHT;
    case 'readAloud':
    case 'readAloudBox': return 60 + textLines * LINE_HEIGHT;
    case 'chapterHeader': return 200;
    case 'titlePage': return PAGE_HEIGHT;
    case 'creditsPage': return 400;
    case 'backCover': return 400;
    case 'classFeature': return 80 + textLines * LINE_HEIGHT;
    case 'raceBlock': return 200;
    case 'handout': return 250;
    case 'fullBleedImage': return PAGE_HEIGHT;
    case 'tableOfContents': return 300;
    default: return 30;
  }
}

function toFillPercent(fillPx: number): number {
  return Math.min(100, Math.max(0, Math.round((fillPx / PAGE_HEIGHT) * 100)));
}

function uniqueFindings(findings: EvaluationFinding[]): EvaluationFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.code}:${finding.affectedScope}:${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeEstimatedArtifactLayout(content: unknown): EstimatedLayoutAnalysis | null {
  if (!content || typeof content !== 'object') return null;

  const doc = content as TipTapNode;
  if (!Array.isArray(doc.content) || doc.content.length === 0) return null;

  const pageSummaries: EstimatedPageSummary[] = [];
  const findings: EvaluationFinding[] = [];

  let currentPage = 1;
  let pageFill = 0;
  let columnBuffer = 0;
  let previousNodeType: string | null = null;

  const flushColumnBuffer = () => {
    if (columnBuffer > 0) {
      pageFill += Math.ceil(columnBuffer * 0.55);
      columnBuffer = 0;
    }
  };

  const finalizePage = (boundary: EstimatedPageSummary['boundary']) => {
    pageSummaries.push({
      page: currentPage,
      fillPercent: toFillPercent(pageFill + Math.ceil(columnBuffer * 0.55)),
      boundary,
    });
  };

  for (let i = 0; i < doc.content.length; i++) {
    const node = doc.content[i];
    const nodeType = node.type;
    const nodeHeight = estimateNodeHeight(node);
    const isColumnSpanning = COLUMN_SPANNING_TYPES.has(nodeType);

    if (nodeType === 'pageBreak') {
      flushColumnBuffer();
      const fillPercent = toFillPercent(pageFill);

      if (previousNodeType === 'pageBreak') {
        findings.push({
          severity: 'major',
          code: 'CONSECUTIVE_PAGE_BREAKS',
          message: `Consecutive manual page breaks appear around node ${i}.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Remove duplicate page breaks unless they are intentionally creating a blank page.',
        });
      }

      if (fillPercent > 0 && fillPercent < 15) {
        findings.push({
          severity: 'major',
          code: 'NEARLY_BLANK_PAGE_AFTER_BREAK',
          message: `A manual page break creates an estimated ${fillPercent}% filled page before node ${i}.`,
          affectedScope: `page-${currentPage}`,
          suggestedFix: 'Remove or move the page break so the preceding page is more fully used.',
        });
      }

      finalizePage('pageBreak');
      currentPage++;
      pageFill = 0;
      columnBuffer = 0;
      previousNodeType = nodeType;
      continue;
    }

    const startFill = pageFill + Math.ceil(columnBuffer * 0.55);
    const headingLevel = nodeType === 'heading'
      ? Number((node.attrs?.level as number | undefined) ?? 1)
      : null;

    if (isColumnSpanning) {
      flushColumnBuffer();

      if (pageFill > 0 && pageFill + nodeHeight > PAGE_HEIGHT) {
        finalizePage('auto');
        currentPage++;
        pageFill = 0;
      }

      if (nodeType === 'heading' && headingLevel === 1 && toFillPercent(pageFill) > 10) {
        findings.push({
          severity: 'major',
          code: 'CHAPTER_HEADING_MID_PAGE',
          message: `A level-1 heading is estimated to start mid-page around node ${i}.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Start major headings at the top of a fresh page or move nearby content so the heading begins near the page top.',
        });
      }

      pageFill += nodeHeight;
      while (pageFill >= PAGE_HEIGHT) {
        finalizePage('auto');
        currentPage++;
        pageFill -= PAGE_HEIGHT;
      }
    } else {
      const effectiveContribution = Math.ceil(nodeHeight * 0.55);

      if (startFill > 0 && startFill + effectiveContribution > PAGE_HEIGHT && pageFill > 0) {
        finalizePage('auto');
        currentPage++;
        pageFill = 0;
        columnBuffer = 0;
      }

      const effectiveStart = pageFill + Math.ceil(columnBuffer * 0.55);
      if (nodeType === 'heading' && headingLevel === 1 && toFillPercent(effectiveStart) > 10) {
        findings.push({
          severity: 'major',
          code: 'CHAPTER_HEADING_MID_PAGE',
          message: `A level-1 heading is estimated to start mid-page around node ${i}.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Start major headings at the top of a fresh page or move nearby content so the heading begins near the page top.',
        });
      }

      if (REFERENCE_BLOCK_TYPES.has(nodeType) && effectiveContribution > PAGE_HEIGHT) {
        findings.push({
          severity: 'minor',
          code: 'SPLIT_REFERENCE_BLOCK',
          message: `${nodeType} at node ${i} is estimated to span more than one page.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Shorten the block or move surrounding content so the reference block fits more cleanly.',
        });
      }

      columnBuffer += nodeHeight;
    }

    previousNodeType = nodeType;
  }

  flushColumnBuffer();
  finalizePage('end');

  const summary = [
    `Estimated pagination: ~${pageSummaries.length} page(s).`,
    ...pageSummaries.map((page) => `P${page.page}: ${page.fillPercent}% → ${page.boundary}`),
  ].join('\n');

  return {
    estimatedPages: pageSummaries.length,
    pageSummaries,
    findings: uniqueFindings(findings),
    summary,
  };
}

