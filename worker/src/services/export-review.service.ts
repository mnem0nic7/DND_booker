import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  DocumentContent,
  DocumentKind,
  ExportReviewAutoFix,
  ExportReview,
  ExportReviewFinding,
  ExportSectionReviewMetric,
  ExportUtilityReviewMetric,
} from '@dnd-booker/shared';
import {
  normalizeChapterHeaderTitle,
  normalizeEncounterEntries,
  normalizeStatBlockAttrs,
  resolveRandomTableEntries,
} from '@dnd-booker/shared';

const execFile = promisify(execFileCallback);

const CHAPTER_OPENER_TOP_RATIO_THRESHOLD = 0.25;
const LAST_PAGE_FILL_RATIO_THRESHOLD = 0.45;
const HEADING_LINE_HEIGHT_THRESHOLD = 14;
const UTILITY_DENSITY_THRESHOLD = 0.14;

const UTILITY_BLOCK_WEIGHTS: Record<string, number> = {
  readAloudBox: 0.5,
  sidebarCallout: 0.5,
  statBlock: 1.25,
  spellCard: 1,
  magicItem: 1,
  randomTable: 1,
  npcProfile: 1,
  encounterTable: 1.25,
  handout: 1,
  mapBlock: 1,
};

const REFERENCE_BLOCK_TYPES = new Set([
  'statBlock',
  'spellCard',
  'magicItem',
  'randomTable',
  'npcProfile',
  'encounterTable',
  'handout',
  'mapBlock',
]);

interface ReviewableDocument {
  title: string;
  kind?: DocumentKind | null;
  content?: DocumentContent | null;
}

interface PdfWord {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

interface PdfLine {
  text: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  words: PdfWord[];
}

interface PdfPage {
  width: number;
  height: number;
  lines: PdfLine[];
}

interface PdfInfoMetrics {
  pageCount: number;
  pageWidthPts: number | null;
  pageHeightPts: number | null;
}

interface SectionMatch {
  page: number;
  topRatio: number;
  lineCount: number;
  hyphenated: boolean;
}

export async function reviewPdfExport(
  filepath: string,
  documents: ReviewableDocument[]
): Promise<ExportReview> {
  const [pdfInfoOutput, bboxOutput] = await Promise.all([
    runPdfinfo(filepath),
    runPdftotextBbox(filepath),
  ]);

  const pdfInfo = parsePdfInfoOutput(pdfInfoOutput);
  const pages = parseBboxLayoutXhtml(bboxOutput);

  return analyzePdfExportLayout({
    documents,
    pages,
    pageCount: pdfInfo.pageCount || pages.length,
    pageWidthPts: pdfInfo.pageWidthPts ?? pages[0]?.width ?? null,
    pageHeightPts: pdfInfo.pageHeightPts ?? pages[0]?.height ?? null,
  });
}

export function buildUnavailableExportReview(message: string): ExportReview {
  return {
    status: 'unavailable',
    score: 0,
    generatedAt: new Date().toISOString(),
    summary: 'Export review was unavailable for this file.',
    passCount: 1,
    appliedFixes: [],
    findings: [
      {
        code: 'EXPORT_REVIEW_UNAVAILABLE',
        severity: 'warning',
        page: null,
        message,
        details: null,
      },
    ],
    metrics: {
      pageCount: 0,
      pageWidthPts: null,
      pageHeightPts: null,
      lastPageFillRatio: null,
      sectionStarts: [],
      utilityCoverage: [],
    },
  };
}

export function parsePdfInfoOutput(output: string): PdfInfoMetrics {
  const pageCountMatch = output.match(/^Pages:\s+(\d+)/m);
  const pageSizeMatch = output.match(/^Page size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts/m);

  return {
    pageCount: pageCountMatch ? Number(pageCountMatch[1]) : 0,
    pageWidthPts: pageSizeMatch ? Number(pageSizeMatch[1]) : null,
    pageHeightPts: pageSizeMatch ? Number(pageSizeMatch[2]) : null,
  };
}

export function parseBboxLayoutXhtml(xhtml: string): PdfPage[] {
  const pages: PdfPage[] = [];
  const pagePattern = /<page\b([^>]*)>([\s\S]*?)<\/page>/g;

  for (const pageMatch of xhtml.matchAll(pagePattern)) {
    const attrs = pageMatch[1];
    const pageContent = pageMatch[2];
    const width = getNumericAttr(attrs, 'width');
    const height = getNumericAttr(attrs, 'height');
    const lines: PdfLine[] = [];

    const linePattern = /<line\b([^>]*)>([\s\S]*?)<\/line>/g;
    for (const lineMatch of pageContent.matchAll(linePattern)) {
      const lineAttrs = lineMatch[1];
      const lineContent = lineMatch[2];
      const words: PdfWord[] = [];

      const wordPattern = /<word\b([^>]*)>([\s\S]*?)<\/word>/g;
      for (const wordMatch of lineContent.matchAll(wordPattern)) {
        const wordAttrs = wordMatch[1];
        const text = decodeXmlEntities(wordMatch[2]).trim();
        if (!text) continue;

        words.push({
          text,
          xMin: getNumericAttr(wordAttrs, 'xMin'),
          yMin: getNumericAttr(wordAttrs, 'yMin'),
          xMax: getNumericAttr(wordAttrs, 'xMax'),
          yMax: getNumericAttr(wordAttrs, 'yMax'),
        });
      }

      if (words.length === 0) continue;

      lines.push({
        text: words.map((word) => word.text).join(' ').replace(/\s+/g, ' ').trim(),
        xMin: getNumericAttr(lineAttrs, 'xMin'),
        yMin: getNumericAttr(lineAttrs, 'yMin'),
        xMax: getNumericAttr(lineAttrs, 'xMax'),
        yMax: getNumericAttr(lineAttrs, 'yMax'),
        words,
      });
    }

    pages.push({ width, height, lines });
  }

  return pages;
}

export function analyzePdfExportLayout(input: {
  documents: ReviewableDocument[];
  pages: PdfPage[];
  pageCount: number;
  pageWidthPts: number | null;
  pageHeightPts: number | null;
}): ExportReview {
  const { documents, pages, pageCount, pageWidthPts, pageHeightPts } = input;
  const findings: ExportReviewFinding[] = [];
  const sectionStarts: ExportSectionReviewMetric[] = [];
  const utilityCoverage: ExportUtilityReviewMetric[] = [];
  let previousSectionPage = 1;

  for (const document of documents.filter((doc) => doc.kind === 'chapter' || doc.kind === 'appendix')) {
    const contentReview = analyzeDocumentUtility(document);
    utilityCoverage.push(contentReview.metric);
    findings.push(...contentReview.findings);

    const match = findSectionMatch(document, pages, previousSectionPage);
    sectionStarts.push({
      title: document.title,
      kind: document.kind ?? null,
      page: match?.page ?? null,
      topRatio: match ? roundRatio(match.topRatio) : null,
      lineCount: match?.lineCount ?? null,
      hyphenated: match?.hyphenated ?? false,
    });

    if (!match) continue;
    previousSectionPage = match.page;

    if (match.topRatio > CHAPTER_OPENER_TOP_RATIO_THRESHOLD) {
      findings.push({
        code: 'EXPORT_CHAPTER_OPENER_LOW',
        severity: 'warning',
        page: match.page,
        message: `"${document.title}" starts too low on page ${match.page}.`,
        details: {
          title: document.title,
          kind: document.kind ?? null,
          topRatio: roundRatio(match.topRatio),
          threshold: CHAPTER_OPENER_TOP_RATIO_THRESHOLD,
        },
      });
    }

    if (shouldFlagSectionTitleWrap(document, match)) {
      findings.push({
        code: 'EXPORT_SECTION_TITLE_WRAP',
        severity: 'warning',
        page: match.page,
        message: match.hyphenated
          ? `"${document.title}" hyphenates or breaks across lines on page ${match.page}.`
          : `"${document.title}" wraps across ${match.lineCount} lines on page ${match.page}.`,
        details: {
          title: document.title,
          kind: document.kind ?? null,
          lineCount: match.lineCount,
          hyphenated: match.hyphenated,
        },
      });
    }

  }

  const lastPageFillRatio = computeLastPageFillRatio(pages.at(-1) ?? null);
  const lastDocument = documents.at(-1);
  if (
    lastPageFillRatio !== null &&
    lastPageFillRatio < LAST_PAGE_FILL_RATIO_THRESHOLD &&
    lastDocument?.kind !== 'back_matter'
  ) {
    findings.push({
      code: 'EXPORT_LAST_PAGE_UNDERFILLED',
      severity: 'warning',
      page: pageCount || pages.length || null,
      message: `The last page is underfilled and ends at ${Math.round(lastPageFillRatio * 100)}% of usable page height.`,
      details: {
        fillRatio: roundRatio(lastPageFillRatio),
        threshold: LAST_PAGE_FILL_RATIO_THRESHOLD,
      },
    });
  }

  const score = Math.max(
    0,
    100 - findings.reduce((total, finding) => total + findingPenalty(finding.code), 0)
  );

  return {
    status: findings.length > 0 ? 'needs_attention' : 'passed',
    score,
    generatedAt: new Date().toISOString(),
    summary: findings.length > 0
      ? `Export review found ${findings.length} issue${findings.length === 1 ? '' : 's'} across ${pageCount} page${pageCount === 1 ? '' : 's'}.`
      : `Export review passed across ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
    passCount: 1,
    appliedFixes: [],
    findings,
    metrics: {
      pageCount,
      pageWidthPts,
      pageHeightPts,
      lastPageFillRatio: lastPageFillRatio === null ? null : roundRatio(lastPageFillRatio),
      sectionStarts,
      utilityCoverage,
    },
  };
}

export function planExportAutoFixes(review: ExportReview): ExportReviewAutoFix[] {
  if (review.status === 'unavailable') return [];

  const fixes: ExportReviewAutoFix[] = [];
  const codes = new Set(review.findings.map((finding) => finding.code));

  if (codes.has('EXPORT_SECTION_TITLE_WRAP')) {
    fixes.push('shrink_h1_headings');
  }

  if (codes.has('EXPORT_CHAPTER_OPENER_LOW')) {
    fixes.push('dedicated_chapter_openers');
  }

  if (codes.has('EXPORT_LAST_PAGE_UNDERFILLED')) {
    fixes.push('dedicated_end_page');
  }

  return fixes;
}

export function finalizeExportReview(
  review: ExportReview,
  appliedFixes: ExportReviewAutoFix[],
  passCount: number
): ExportReview {
  return {
    ...review,
    appliedFixes,
    passCount,
    summary: appliedFixes.length > 0
      ? `${review.summary} Applied ${appliedFixes.length} export auto-fix${appliedFixes.length === 1 ? '' : 'es'}.`
      : review.summary,
  };
}

export function isBetterExportReview(candidate: ExportReview, baseline: ExportReview): boolean {
  const statusRank = (review: ExportReview): number => {
    if (review.status === 'passed') return 2;
    if (review.status === 'needs_attention') return 1;
    return 0;
  };

  const candidateRank = statusRank(candidate);
  const baselineRank = statusRank(baseline);
  if (candidateRank !== baselineRank) return candidateRank > baselineRank;
  if (candidate.score !== baseline.score) return candidate.score > baseline.score;
  if (candidate.findings.length !== baseline.findings.length) return candidate.findings.length < baseline.findings.length;

  return false;
}

async function runPdfinfo(filepath: string): Promise<string> {
  const { stdout } = await execFile('pdfinfo', [filepath], { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
}

async function runPdftotextBbox(filepath: string): Promise<string> {
  const { stdout } = await execFile('pdftotext', ['-bbox-layout', filepath, '-'], { maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function getNumericAttr(attrs: string, name: string): number {
  const match = attrs.match(new RegExp(`${name}="([^"]+)"`));
  return match ? Number(match[1]) : 0;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, num) => String.fromCodePoint(Number.parseInt(num, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\u00ad/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSectionReviewTitle(title: string): string {
  return normalizeText(normalizeChapterHeaderTitle(title, title));
}

function findSectionMatch(
  document: ReviewableDocument,
  pages: PdfPage[],
  minimumPage: number
): SectionMatch | null {
  const titleNeedle = normalizeSectionReviewTitle(document.title);
  if (!titleNeedle) return null;

  const candidates: Array<SectionMatch & { score: number }> = [];

  for (let pageIndex = Math.max(minimumPage - 1, 0); pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];

    for (let lineIndex = 0; lineIndex < page.lines.length; lineIndex++) {
      for (let span = 1; span <= 3 && lineIndex + span <= page.lines.length; span++) {
        const candidateLines = page.lines.slice(lineIndex, lineIndex + span);
        const joinedText = normalizeText(joinLinesForMatch(candidateLines));
        if (!joinedText.includes(titleNeedle)) continue;
        const titleLineCount = getTitleLineCount(candidateLines, titleNeedle);
        if (titleLineCount === 0) continue;

        const headingScore = getHeadingScore(candidateLines, titleNeedle);
        const topRatio = candidateLines[0].yMin / page.height;
        candidates.push({
          page: pageIndex + 1,
          topRatio,
          lineCount: titleLineCount,
          hyphenated: candidateLines.some(lineEndsWithHyphen),
          score: headingScore * 1000 - pageIndex * 10 - lineIndex,
        });
        break;
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return {
    page: best.page,
    topRatio: best.topRatio,
    lineCount: best.lineCount,
    hyphenated: best.hyphenated,
  };
}

function getHeadingScore(lines: PdfLine[], normalizedTitle: string): number {
  const hasChapterLabel = lines.some((line) => /^chapter\s+\d+/i.test(normalizeText(line.text)));
  const maxLineHeight = Math.max(...lines.map((line) => line.yMax - line.yMin));
  const startsNearTop = lines[0].yMin < 240;
  const isExactTitleLine = lines.some((line) => normalizeText(line.text).includes(normalizedTitle));

  let score = 0;
  if (hasChapterLabel) score += 4;
  if (maxLineHeight >= HEADING_LINE_HEIGHT_THRESHOLD) score += 3;
  if (startsNearTop) score += 2;
  if (isExactTitleLine) score += 1;
  return score;
}

function shouldFlagSectionTitleWrap(document: ReviewableDocument, match: SectionMatch): boolean {
  if (match.hyphenated) return true;
  if (document.kind === 'chapter' || document.kind === 'appendix') {
    return match.lineCount > 2;
  }
  return match.lineCount > 1;
}

function lineEndsWithHyphen(line: PdfLine): boolean {
  const lastWord = line.words.at(-1)?.text ?? '';
  return /[-\u00ad\u2010-\u2015]$/.test(lastWord);
}

function joinLinesForMatch(lines: PdfLine[]): string {
  let joined = '';

  for (const line of lines) {
    const trimmed = line.text.trim();
    if (!trimmed) continue;

    if (!joined) {
      joined = trimmed;
      continue;
    }

    if (/[-\u00ad\u2010-\u2015]$/.test(joined)) {
      joined = joined.replace(/[-\u00ad\u2010-\u2015]+$/, '') + trimmed;
    } else {
      joined += ` ${trimmed}`;
    }
  }

  return joined;
}

function getTitleLineCount(lines: PdfLine[], normalizedTitle: string): number {
  const titleWords = new Set(normalizedTitle.split(' ').filter(Boolean));
  let count = 0;
  let continuationExpected = false;

  for (const line of lines) {
    const overlapsTitle = lineContainsTitleWords(line, titleWords);
    if (overlapsTitle || continuationExpected) {
      count += 1;
    }
    continuationExpected = lineEndsWithHyphen(line);
  }

  return count;
}

function lineContainsTitleWords(line: PdfLine, titleWords: Set<string>): boolean {
  const words = normalizeText(line.text).split(' ').filter(Boolean);
  if (words.length === 0) return false;

  let overlapCount = 0;
  for (const word of words) {
    if (!titleWords.has(word)) continue;
    overlapCount += 1;
  }

  return overlapCount >= Math.min(2, titleWords.size);
}

function computeLastPageFillRatio(page: PdfPage | null): number | null {
  if (!page) return null;
  const lines = page.lines.filter((line) => line.yMin < page.height * 0.9 && normalizeText(line.text) !== '');
  if (lines.length === 0) return null;

  const top = Math.min(...lines.map((line) => line.yMin));
  const bottom = Math.max(...lines.map((line) => line.yMax));
  const usableHeight = page.height - top;

  if (usableHeight <= 0) return null;
  return (bottom - top) / usableHeight;
}

function findingPenalty(code: ExportReviewFinding['code']): number {
  switch (code) {
    case 'EXPORT_CHAPTER_OPENER_LOW':
      return 18;
    case 'EXPORT_SECTION_TITLE_WRAP':
      return 10;
    case 'EXPORT_LAST_PAGE_UNDERFILLED':
      return 12;
    case 'EXPORT_EMPTY_ENCOUNTER_TABLE':
      return 22;
    case 'EXPORT_EMPTY_RANDOM_TABLE':
      return 18;
    case 'EXPORT_PLACEHOLDER_STAT_BLOCK':
      return 24;
    case 'EXPORT_OVERSIZED_DISPLAY_HEADING':
      return 18;
    case 'EXPORT_LOW_UTILITY_DENSITY':
      return 16;
    case 'EXPORT_REVIEW_UNAVAILABLE':
      return 0;
    default:
      return 0;
  }
}

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function analyzeDocumentUtility(document: ReviewableDocument): {
  metric: ExportUtilityReviewMetric;
  findings: ExportReviewFinding[];
} {
  const inspection = inspectDocumentContent(document.content ?? null, document.title);
  const utilityDensity = inspection.utilityWeight <= 0
    ? 0
    : inspection.utilityWeight / (inspection.utilityWeight + inspection.proseParagraphCount);

  const findings = [...inspection.findings];
  if (
    (document.kind === 'chapter' || document.kind === 'appendix')
    && inspection.proseParagraphCount >= 4
    && utilityDensity < UTILITY_DENSITY_THRESHOLD
  ) {
    findings.push({
      code: 'EXPORT_LOW_UTILITY_DENSITY',
      severity: 'warning',
      page: null,
      message: `"${document.title}" is prose-heavy and under-indexed for table use.`,
      details: {
        title: document.title,
        kind: document.kind ?? null,
        proseParagraphCount: inspection.proseParagraphCount,
        utilityBlockCount: inspection.utilityBlockCount,
        referenceBlockCount: inspection.referenceBlockCount,
        utilityDensity: roundRatio(utilityDensity),
        threshold: UTILITY_DENSITY_THRESHOLD,
      },
    });
  }

  return {
    metric: {
      title: document.title,
      kind: document.kind ?? null,
      utilityBlockCount: inspection.utilityBlockCount,
      referenceBlockCount: inspection.referenceBlockCount,
      proseParagraphCount: inspection.proseParagraphCount,
      utilityDensity: roundRatio(utilityDensity),
    },
    findings,
  };
}

function inspectDocumentContent(content: DocumentContent | null, documentTitle: string): {
  proseParagraphCount: number;
  utilityBlockCount: number;
  referenceBlockCount: number;
  utilityWeight: number;
  findings: ExportReviewFinding[];
} {
  if (!content) {
    return {
      proseParagraphCount: 0,
      utilityBlockCount: 0,
      referenceBlockCount: 0,
      utilityWeight: 0,
      findings: [],
    };
  }

  const findings: ExportReviewFinding[] = [];
  let proseParagraphCount = 0;
  let utilityBlockCount = 0;
  let referenceBlockCount = 0;
  let utilityWeight = 0;

  const visit = (node: DocumentContent, documentTitle: string, insideUtilityContainer = false) => {
    const nodeType = node.type;
    const nodeWeight = UTILITY_BLOCK_WEIGHTS[nodeType] ?? 0;
    const isUtilityBlock = nodeWeight > 0;

    if (isUtilityBlock) {
      utilityBlockCount += 1;
      utilityWeight += nodeWeight;
      if (REFERENCE_BLOCK_TYPES.has(nodeType)) referenceBlockCount += 1;

      if (nodeType === 'encounterTable' && normalizeEncounterEntries(node.attrs?.entries).length === 0) {
        findings.push({
          code: 'EXPORT_EMPTY_ENCOUNTER_TABLE',
          severity: 'error',
          page: null,
          message: `"${documentTitle}" includes an empty encounter table.`,
          details: {
            title: documentTitle,
            blockType: nodeType,
          },
        });
      }

      if (nodeType === 'randomTable' && resolveRandomTableEntries(node.attrs ?? {}).length === 0) {
        findings.push({
          code: 'EXPORT_EMPTY_RANDOM_TABLE',
          severity: 'error',
          page: null,
          message: `"${documentTitle}" includes an empty random table.`,
          details: {
            title: documentTitle,
            blockType: nodeType,
          },
        });
      }

      if (nodeType === 'statBlock' && isPlaceholderStatBlock(node)) {
        const normalizedAttrs = normalizeStatBlockAttrs(node.attrs ?? {});
        findings.push({
          code: 'EXPORT_PLACEHOLDER_STAT_BLOCK',
          severity: 'error',
          page: null,
          message: `"${documentTitle}" includes a broken or placeholder stat block.`,
          details: {
            title: documentTitle,
            blockType: nodeType,
            name: typeof normalizedAttrs.name === 'string' ? normalizedAttrs.name : readStringAttr(node, 'name'),
            ac: Number(normalizedAttrs.ac),
            hp: Number(normalizedAttrs.hp),
          },
        });
      }
    }

    if (nodeType === 'heading' && isOversizedDisplayHeading(node)) {
      findings.push({
        code: 'EXPORT_OVERSIZED_DISPLAY_HEADING',
        severity: 'warning',
        page: null,
        message: `"${documentTitle}" includes an oversized display heading that is likely malformed.`,
        details: {
          title: documentTitle,
          text: readNodeText(node).trim().slice(0, 180),
          level: readNumberAttr(node, 'level'),
          wordCount: readNodeText(node).trim().split(/\s+/).filter(Boolean).length,
        },
      });
    }

    if (!insideUtilityContainer && !isUtilityBlock && nodeType === 'paragraph' && hasParagraphText(node)) {
      proseParagraphCount += 1;
    }

    for (const child of node.content ?? []) {
      visit(child, documentTitle, insideUtilityContainer || isUtilityBlock);
    }
  };

  visit(content, documentTitle);

  return {
    proseParagraphCount,
    utilityBlockCount,
    referenceBlockCount,
    utilityWeight,
    findings,
  };
}

function hasParagraphText(node: DocumentContent): boolean {
  return readNodeText(node).trim().length > 0;
}

function readNodeText(node: DocumentContent): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
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

function readStringAttr(node: DocumentContent, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readNumberAttr(node: DocumentContent, key: string): number {
  const value = Number(node.attrs?.[key]);
  return Number.isFinite(value) ? value : Number.NaN;
}
