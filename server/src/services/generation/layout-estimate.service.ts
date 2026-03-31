import {
  buildFlowTextLayoutShadowTelemetry,
  compileFlowModel,
  compileMeasuredPageModel,
  estimateFlowUnitHeight,
  measureFlowTextUnits,
  parseTextLayoutEngineMode,
  type DocumentContent,
  type EvaluationFinding,
} from '@dnd-booker/shared';
import { ensureNodeCanvasMeasurementBackend } from '@dnd-booker/text-layout/node';

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

interface AnalyzeEstimatedArtifactLayoutOptions {
  theme?: string | null;
  documentKind?: string | null;
  documentTitle?: string | null;
  fallbackScopeIds?: string[];
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

function getEffectiveNodeContribution(node: TipTapNode): number {
  return Math.ceil(estimateNodeHeight(node) * 0.55);
}

function isChapterOpener(node: TipTapNode): boolean {
  return node.type === 'chapterHeader'
    || (node.type === 'heading' && Number((node.attrs?.level as number | undefined) ?? 1) === 1);
}

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

export function analyzeEstimatedArtifactLayout(
  content: unknown,
  options: AnalyzeEstimatedArtifactLayoutOptions = {},
): EstimatedLayoutAnalysis | null {
  if (!content || typeof content !== 'object') return null;

  const doc = content as TipTapNode;
  if (!Array.isArray(doc.content) || doc.content.length === 0) return null;
  const textLayoutMode = parseTextLayoutEngineMode(process.env.TEXT_LAYOUT_ENGINE_MODE);

  if (textLayoutMode !== 'legacy') {
    ensureNodeCanvasMeasurementBackend();
  }

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

      const nextNode = doc.content[i + 1];
      if (
        nextNode
        && REFERENCE_BLOCK_TYPES.has(nextNode.type)
        && fillPercent >= 15
        && pageFill + getEffectiveNodeContribution(nextNode) <= PAGE_HEIGHT
      ) {
        findings.push({
          severity: 'minor',
          code: 'REFERENCE_BLOCK_STRANDED_AFTER_BREAK',
          message: `${nextNode.type} at node ${i + 1} is separated from its preceding content by a manual page break even though it should still fit on page ${currentPage}.`,
          affectedScope: `node-${i + 1}`,
          suggestedFix: 'Remove the manual page break before the support block so it stays closer to the related scene or heading.',
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
    if (isColumnSpanning) {
      flushColumnBuffer();

      if (pageFill > 0 && pageFill + nodeHeight > PAGE_HEIGHT) {
        finalizePage('auto');
        currentPage++;
        pageFill = 0;
      }

      if (isChapterOpener(node) && toFillPercent(pageFill) > 10) {
        findings.push({
          severity: 'major',
          code: 'CHAPTER_HEADING_MID_PAGE',
          message: `A chapter opener is estimated to start mid-page around node ${i}.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Start major chapter openers at the top of a fresh page or move nearby content so the opener begins near the page top.',
        });
      }

      pageFill += nodeHeight;
      while (pageFill >= PAGE_HEIGHT) {
        finalizePage('auto');
        currentPage++;
        pageFill -= PAGE_HEIGHT;
      }
    } else {
      const effectiveContribution = getEffectiveNodeContribution(node);

      if (startFill > 0 && startFill + effectiveContribution > PAGE_HEIGHT && pageFill > 0) {
        finalizePage('auto');
        currentPage++;
        pageFill = 0;
        columnBuffer = 0;
      }

      const effectiveStart = pageFill + Math.ceil(columnBuffer * 0.55);
      if (isChapterOpener(node) && toFillPercent(effectiveStart) > 10) {
        findings.push({
          severity: 'major',
          code: 'CHAPTER_HEADING_MID_PAGE',
          message: `A chapter opener is estimated to start mid-page around node ${i}.`,
          affectedScope: `node-${i}`,
          suggestedFix: 'Start major chapter openers at the top of a fresh page or move nearby content so the opener begins near the page top.',
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

  let resolvedPageSummaries = pageSummaries;
  let estimatedPages = pageSummaries.length;

  if (textLayoutMode !== 'legacy') {
    try {
      const flow = compileFlowModel(doc as unknown as DocumentContent, null, 'standard_pdf', {});
      const legacyMeasurements = flow.flow.units.map((unit) => ({
        unitId: unit.id,
        heightPx: estimateFlowUnitHeight(unit, flow.flow.fragments),
      }));
      const engineResult = measureFlowTextUnits(flow.flow, {
        theme: options.theme ?? process.env.TEXT_LAYOUT_THEME ?? 'gilded-folio',
        documentKind: options.documentKind ?? null,
        documentTitle: options.documentTitle ?? null,
        fallbackScopeIds: options.fallbackScopeIds,
      });
      const enginePageModel = compileMeasuredPageModel(flow.flow, engineResult.measurements, {
        respectManualPageBreaks: true,
      });
      const engineSummaries = enginePageModel.pages.map((page, index) => ({
        page: page.index,
        fillPercent: toFillPercent(page.fillRatio * PAGE_HEIGHT),
        boundary: page.boundaryType === 'pageBreak'
          ? 'pageBreak' as const
          : index === enginePageModel.pages.length - 1
            ? 'end' as const
            : 'auto' as const,
      }));

      if (textLayoutMode === 'shadow') {
        console.info('[text-layout:shadow]', {
          scope: 'server-layout-estimate',
          ...buildFlowTextLayoutShadowTelemetry({
            legacyMeasurements,
            engineMeasurements: engineResult.measurements,
            engineTelemetry: engineResult.telemetry,
            legacyPageCount: pageSummaries.length,
            pretextPageCount: engineSummaries.length,
            unsupportedScopeIds: engineResult.unsupportedUnitIds,
          }),
        });
      }

      if (textLayoutMode === 'pretext') {
        resolvedPageSummaries = engineSummaries;
        estimatedPages = engineSummaries.length;
      }
    } catch (error) {
      console.warn('[text-layout] failed to measure estimated artifact layout', error);
    }
  }

  const summary = [
    `Estimated pagination: ~${estimatedPages} page(s).`,
    ...resolvedPageSummaries.map((page) => `P${page.page}: ${page.fillPercent}% → ${page.boundary}`),
  ].join('\n');

  return {
    estimatedPages,
    pageSummaries: resolvedPageSummaries,
    findings: uniqueFindings(findings),
    summary,
  };
}
