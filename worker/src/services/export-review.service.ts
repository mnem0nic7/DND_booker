import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  DocumentContent,
  DocumentKind,
  ExportReviewAutoFix,
  ExportReview,
  ExportReviewFinding,
  LayoutPlan,
  PageModel,
  ExportSectionReviewMetric,
  ExportUtilityReviewMetric,
} from '@dnd-booker/shared';
import {
  assessRandomTableEntries,
  assessStatBlockAttrs,
  hasEncounterTableContent,
  normalizeChapterHeaderTitle,
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
  bulletList: 0.5,
  orderedList: 0.5,
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
  layoutPlan?: LayoutPlan | null;
  pageModel?: PageModel | null;
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

interface MeasuredReviewPage {
  page: number;
  fillRatio: number;
  isOpener: boolean;
  isFullPageInsert: boolean;
  bottomPanelFillRatio: number;
  leftFillRatio: number | null;
  rightFillRatio: number | null;
  deltaRatio: number | null;
  contentHeightPx: number;
  title: string | null;
  fragments: PageModel['pages'][number]['fragments'];
}

export async function reviewPdfExport(
  filepath: string,
  documents: ReviewableDocument[]
): Promise<ExportReview> {
  const pdfInfoOutput = await runPdfinfo(filepath);
  const pdfInfo = parsePdfInfoOutput(pdfInfoOutput);

  if (documents.some((document) => document.pageModel && document.pageModel.pages.length > 0)) {
    return reviewMeasuredExportLayout({
      documents,
      pageCount: pdfInfo.pageCount,
      pageWidthPts: pdfInfo.pageWidthPts,
      pageHeightPts: pdfInfo.pageHeightPts,
    });
  }

  const bboxOutput = await runPdftotextBbox(filepath);
  const pages = parseBboxLayoutXhtml(bboxOutput);

  return analyzePdfExportLayout({
    documents,
    pages,
    pageCount: pdfInfo.pageCount || pages.length,
    pageWidthPts: pdfInfo.pageWidthPts ?? pages[0]?.width ?? null,
    pageHeightPts: pdfInfo.pageHeightPts ?? pages[0]?.height ?? null,
  });
}

export function reviewMeasuredExportLayout(input: {
  documents: ReviewableDocument[];
  pageCount?: number | null;
  pageWidthPts?: number | null;
  pageHeightPts?: number | null;
}): ExportReview {
  return analyzePdfExportLayoutFromPageModels({
    documents: input.documents,
    pageCount: input.pageCount ?? 0,
    pageWidthPts: input.pageWidthPts ?? null,
    pageHeightPts: input.pageHeightPts ?? null,
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
  if (documents.some((document) => document.pageModel && document.pageModel.pages.length > 0)) {
    return analyzePdfExportLayoutFromPageModels({
      documents,
      pageCount,
      pageWidthPts,
      pageHeightPts,
    });
  }
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
  const sectionStartPages = new Set(sectionStarts.map((metric) => metric.page).filter((page): page is number => page !== null));
  findings.push(...analyzePageLayout(pages, sectionStartPages));

  if (
    pageCount <= 10 &&
    documents.some((document) => documentContainsNodeType(document.content ?? null, 'tableOfContents'))
  ) {
    findings.push({
      code: 'EXPORT_OVERLONG_TOC_FOR_SHORT_BOOK',
      severity: 'warning',
      page: 2,
      message: 'A short one-shot still includes a table of contents that is likely wasting front-matter space.',
      details: {
        pageCount,
      },
    });
  }

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

function analyzePdfExportLayoutFromPageModels(input: {
  documents: ReviewableDocument[];
  pageCount: number;
  pageWidthPts: number | null;
  pageHeightPts: number | null;
}): ExportReview {
  const { documents, pageCount, pageWidthPts, pageHeightPts } = input;
  const findings: ExportReviewFinding[] = [];
  const sectionStarts: ExportSectionReviewMetric[] = [];
  const utilityCoverage: ExportUtilityReviewMetric[] = [];
  const globalPages: MeasuredReviewPage[] = [];
  let pageOffset = 0;

  for (const document of documents) {
    const contentReview = analyzeDocumentUtility(document);
    utilityCoverage.push(contentReview.metric);
    findings.push(...contentReview.findings);

    const pageModel = document.pageModel ?? null;
    if (pageModel) {
      for (const page of pageModel.pages) {
        globalPages.push({
          page: page.index + pageOffset,
          fillRatio: page.fillRatio,
          isOpener: Boolean(page.openerDocumentId),
          isFullPageInsert: page.fragments.some((fragment) => fragment.region === 'full_page'),
          bottomPanelFillRatio: computeBottomPanelFillRatio(page),
          leftFillRatio: page.columnMetrics.leftFillRatio,
          rightFillRatio: page.columnMetrics.rightFillRatio,
          deltaRatio: page.columnMetrics.deltaRatio,
          contentHeightPx: page.contentHeightPx,
          title: document.title,
          fragments: page.fragments,
        });
      }
    }

    if (document.kind !== 'chapter' && document.kind !== 'appendix') {
      pageOffset += pageModel?.pages.length ?? 0;
      continue;
    }

    const openerPage = pageModel?.pages.find((page) =>
      page.fragments.some((fragment) => fragment.isOpener || fragment.isHero || fragment.nodeType === 'chapterHeader'),
    ) ?? pageModel?.pages[0] ?? null;
    const openerFragment = openerPage?.fragments.find((fragment) =>
      fragment.isOpener || fragment.isHero || fragment.nodeType === 'chapterHeader',
    ) ?? openerPage?.fragments[0] ?? null;
    const topRatio = openerPage && openerFragment
      ? openerFragment.bounds.y / Math.max(1, openerPage.contentHeightPx)
      : null;

    sectionStarts.push({
      title: document.title,
      kind: document.kind ?? null,
      page: openerPage ? openerPage.index + pageOffset : null,
      topRatio: topRatio === null ? null : roundRatio(topRatio),
      lineCount: openerFragment ? 1 : null,
      hyphenated: false,
    });

    if (openerPage && topRatio !== null && topRatio > CHAPTER_OPENER_TOP_RATIO_THRESHOLD) {
      findings.push({
        code: 'EXPORT_CHAPTER_OPENER_LOW',
        severity: 'warning',
        page: openerPage.index + pageOffset,
        message: `"${document.title}" starts too low on page ${openerPage.index + pageOffset}.`,
        details: {
          title: document.title,
          kind: document.kind ?? null,
          topRatio: roundRatio(topRatio),
          threshold: CHAPTER_OPENER_TOP_RATIO_THRESHOLD,
        },
      });
    }

    pageOffset += pageModel?.pages.length ?? 0;
  }

  findings.push(...analyzeMeasuredPageLayout(globalPages));

  const effectivePageCount = pageCount || globalPages.length;

  if (
    effectivePageCount <= 10 &&
    documents.some((document) => documentContainsNodeType(document.content ?? null, 'tableOfContents'))
  ) {
    findings.push({
      code: 'EXPORT_OVERLONG_TOC_FOR_SHORT_BOOK',
      severity: 'warning',
      page: 2,
      message: 'A short one-shot still includes a table of contents that is likely wasting front-matter space.',
      details: { pageCount: effectivePageCount },
    });
  }

  const lastPageFillRatio = globalPages.at(-1)?.fillRatio ?? null;
  const lastDocument = documents.at(-1);
  if (
    lastPageFillRatio !== null &&
    lastPageFillRatio < LAST_PAGE_FILL_RATIO_THRESHOLD &&
    lastDocument?.kind !== 'back_matter'
  ) {
    findings.push({
      code: 'EXPORT_LAST_PAGE_UNDERFILLED',
      severity: 'warning',
      page: (globalPages.at(-1)?.page ?? effectivePageCount) || null,
      message: `The last page is underfilled and ends at ${Math.round(lastPageFillRatio * 100)}% of usable page height.`,
      details: {
        fillRatio: roundRatio(lastPageFillRatio),
        threshold: LAST_PAGE_FILL_RATIO_THRESHOLD,
      },
    });
  }

  const score = Math.max(
    0,
    100 - findings.reduce((total, finding) => total + findingPenalty(finding.code), 0),
  );

  return {
    status: findings.length > 0 ? 'needs_attention' : 'passed',
    score,
    generatedAt: new Date().toISOString(),
    summary: findings.length > 0
      ? `Export review found ${findings.length} issue${findings.length === 1 ? '' : 's'} across ${effectivePageCount} page${effectivePageCount === 1 ? '' : 's'}.`
      : `Export review passed across ${effectivePageCount} page${effectivePageCount === 1 ? '' : 's'}.`,
    passCount: 1,
    appliedFixes: [],
    findings,
    metrics: {
      pageCount: effectivePageCount,
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

  if (
    codes.has('EXPORT_SECTION_TITLE_WRAP')
    || codes.has('EXPORT_CHAPTER_OPENER_LOW')
    || codes.has('EXPORT_LAST_PAGE_UNDERFILLED')
    || codes.has('EXPORT_UNUSED_PAGE_REGION')
    || codes.has('EXPORT_MISSED_ART_OPPORTUNITY')
    || codes.has('EXPORT_WEAK_HERO_PLACEMENT')
    || codes.has('EXPORT_SPLIT_SCENE_PACKET')
    || codes.has('EXPORT_UNBALANCED_COLUMNS')
    || codes.has('EXPORT_MARGIN_COLLISION')
    || codes.has('EXPORT_FOOTER_COLLISION')
    || codes.has('EXPORT_ORPHAN_TAIL_PARAGRAPH')
    || codes.has('EXPORT_OVERLONG_TOC_FOR_SHORT_BOOK')
  ) {
    fixes.push('refresh_layout_plan');
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
    case 'EXPORT_UNUSED_PAGE_REGION':
      return 14;
    case 'EXPORT_MISSED_ART_OPPORTUNITY':
      return 10;
    case 'EXPORT_WEAK_HERO_PLACEMENT':
      return 12;
    case 'EXPORT_SPLIT_SCENE_PACKET':
      return 12;
    case 'EXPORT_UNBALANCED_COLUMNS':
      return 10;
    case 'EXPORT_MARGIN_COLLISION':
      return 12;
    case 'EXPORT_FOOTER_COLLISION':
      return 18;
    case 'EXPORT_ORPHAN_TAIL_PARAGRAPH':
      return 12;
    case 'EXPORT_OVERLONG_TOC_FOR_SHORT_BOOK':
      return 10;
    case 'EXPORT_EMPTY_ENCOUNTER_TABLE':
      return 22;
    case 'EXPORT_EMPTY_RANDOM_TABLE':
      return 18;
    case 'EXPORT_THIN_RANDOM_TABLE':
      return 14;
    case 'EXPORT_PLACEHOLDER_STAT_BLOCK':
      return 24;
    case 'EXPORT_SUSPICIOUS_STAT_BLOCK':
      return 12;
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
  findings.push(...analyzeDocumentLayout(document));
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

function analyzeDocumentLayout(document: ReviewableDocument): ExportReviewFinding[] {
  const findings: ExportReviewFinding[] = [];
  const content = document.content ?? null;
  const layoutPlan = document.layoutPlan ?? null;
  const pageModel = document.pageModel ?? null;

  if (hasHeroCandidate(content) && !hasStrongHeroPlacement(layoutPlan, pageModel)) {
    findings.push({
      code: 'EXPORT_WEAK_HERO_PLACEMENT',
      severity: 'warning',
      page: null,
      message: `"${document.title}" has hero-worthy artwork or opener content that is not using a full-width hero placement.`,
      details: {
        title: document.title,
        kind: document.kind ?? null,
      },
    });
  }

  if (hasEncounterPacketContent(content) && !hasEncounterPacketGrouping(layoutPlan, pageModel)) {
    findings.push({
      code: 'EXPORT_SPLIT_SCENE_PACKET',
      severity: 'warning',
      page: null,
      message: `"${document.title}" has encounter packet content that is not grouped tightly enough for reliable page layout.`,
      details: {
        title: document.title,
        kind: document.kind ?? null,
      },
    });
  }

  return findings;
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

      if (nodeType === 'encounterTable' && !hasEncounterTableContent(node.attrs ?? {})) {
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
      } else if (nodeType === 'randomTable') {
        const assessment = assessRandomTableEntries(node.attrs?.entries ?? node.attrs?.results);
        if (assessment.isThin) {
          findings.push({
            code: 'EXPORT_THIN_RANDOM_TABLE',
            severity: 'warning',
            page: null,
            message: `"${documentTitle}" includes a random encounter table that is too thin to run confidently at the table.`,
            details: {
              title: documentTitle,
              blockType: nodeType,
              thinEntryCount: assessment.thinEntryCount,
              averageWordCount: Math.round(assessment.averageWordCount * 10) / 10,
              entryCount: assessment.normalizedEntries.length,
            },
          });
        }
      }

      if (nodeType === 'statBlock') {
        const assessment = assessStatBlockAttrs(node.attrs ?? {});

        if (assessment.isPlaceholder) {
          findings.push({
            code: 'EXPORT_PLACEHOLDER_STAT_BLOCK',
            severity: 'error',
            page: null,
            message: `"${documentTitle}" includes a broken or placeholder stat block.`,
            details: {
              title: documentTitle,
              blockType: nodeType,
              name: typeof assessment.normalizedAttrs.name === 'string'
                ? assessment.normalizedAttrs.name
                : readStringAttr(node, 'name'),
              ac: Number(assessment.normalizedAttrs.ac),
              hp: Number(assessment.normalizedAttrs.hp),
              flags: assessment.flags,
            },
          });
        } else if (assessment.isSuspicious) {
          findings.push({
            code: 'EXPORT_SUSPICIOUS_STAT_BLOCK',
            severity: 'warning',
            page: null,
            message: `"${documentTitle}" includes a suspicious stat block that likely needs review.`,
            details: {
              title: documentTitle,
              blockType: nodeType,
              name: typeof assessment.normalizedAttrs.name === 'string'
                ? assessment.normalizedAttrs.name
                : readStringAttr(node, 'name'),
              speed: String(assessment.normalizedAttrs.speed ?? ''),
              flags: assessment.flags,
            },
          });
        }
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

    if (!insideUtilityContainer && !isUtilityBlock) {
      if (nodeType === 'paragraph' && isStructuredUtilityParagraph(node)) {
        utilityBlockCount += 1;
        utilityWeight += 0.5;
      } else if (nodeType === 'paragraph' && hasParagraphText(node)) {
        proseParagraphCount += 1;
      }
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

function analyzePageLayout(pages: PdfPage[], sectionStartPages: Set<number>): ExportReviewFinding[] {
  const findings: ExportReviewFinding[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const pageNumber = index + 1;
    const page = pages[index];
    if (!page) continue;

    const fillRatio = computeLastPageFillRatio(page);
    if (
      fillRatio !== null &&
      fillRatio < 0.58 &&
      pageNumber > 1 &&
      pageNumber < pages.length &&
      !sectionStartPages.has(pageNumber) &&
      !sectionStartPages.has(pageNumber + 1)
    ) {
      findings.push({
        code: 'EXPORT_UNUSED_PAGE_REGION',
        severity: 'warning',
        page: pageNumber,
        message: `Page ${pageNumber} leaves a large unused region that should be reclaimed by layout.`,
        details: {
          fillRatio: roundRatio(fillRatio),
        },
      });
    }

    const balance = measureColumnBalance(page);
    if (balance !== null && balance.deltaRatio > 0.18) {
      findings.push({
        code: 'EXPORT_UNBALANCED_COLUMNS',
        severity: 'warning',
        page: pageNumber,
        message: `Page ${pageNumber} has noticeably unbalanced columns.`,
        details: {
          deltaRatio: roundRatio(balance.deltaRatio),
          leftBottomRatio: roundRatio(balance.leftBottomRatio),
          rightBottomRatio: roundRatio(balance.rightBottomRatio),
        },
      });
    }
  }

  return findings;
}

function analyzeMeasuredPageLayout(pages: MeasuredReviewPage[]): ExportReviewFinding[] {
  const findings: ExportReviewFinding[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page) continue;
    const isInterior = page.page > 1 && page.page < pages.length;
    const units = collectMeasuredPageUnits(page);
    const overflow = measureMeasuredPageOverflow(page, units);
    const whitespace = measureMeasuredPageWhitespace(page, units);
    const isTitlePageOpener = page.isOpener
      && units.length === 1
      && units[0]?.nodeTypes.length === 1
      && units[0]?.nodeTypes[0] === 'titlePage';

    if (!isTitlePageOpener && overflow.footerCollision) {
      findings.push({
        code: 'EXPORT_FOOTER_COLLISION',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} has content entering the footer reserve and is at risk of clipping.`,
        details: {
          title: page.title,
          contentHeightPx: page.contentHeightPx,
          bottomPx: Math.round(overflow.maxBottom),
          unitId: overflow.unitId,
          nodeTypes: overflow.nodeTypes,
        },
      });
    } else if (!isTitlePageOpener && overflow.marginCollision) {
      findings.push({
        code: 'EXPORT_MARGIN_COLLISION',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} packs content too tightly against the bottom margin.`,
        details: {
          title: page.title,
          contentHeightPx: page.contentHeightPx,
          bottomPx: Math.round(overflow.maxBottom),
          unitId: overflow.unitId,
          nodeTypes: overflow.nodeTypes,
        },
      });
    }

    const orphanTail = detectOrphanTailUnit(page, units);
    if (orphanTail) {
      findings.push({
        code: 'EXPORT_ORPHAN_TAIL_PARAGRAPH',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} starts with a short orphaned tail paragraph or support packet that should be pulled back.`,
        details: {
          title: page.title,
          unitId: orphanTail.unitId,
          nodeTypes: orphanTail.nodeTypes,
          textLength: orphanTail.textLength,
          fillRatio: roundRatio(page.fillRatio),
        },
      });
    }

    if (
      isInterior
      && !page.isOpener
      && !page.isFullPageInsert
      && (
        page.fillRatio < 0.58
        || (page.fillRatio < 0.72 && whitespace.bottomGapRatio > 0.18)
      )
    ) {
      findings.push({
        code: 'EXPORT_UNUSED_PAGE_REGION',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} leaves a large unused region that should be reclaimed by layout.`,
        details: {
          title: page.title,
          fillRatio: roundRatio(page.fillRatio),
          bottomGapRatio: roundRatio(whitespace.bottomGapRatio),
        },
      });
    }

    if (
      !page.isOpener
      && page.deltaRatio !== null
      && page.deltaRatio > 0.18
      && page.bottomPanelFillRatio < 0.12
      && page.leftFillRatio !== null
      && page.rightFillRatio !== null
    ) {
      findings.push({
        code: 'EXPORT_UNBALANCED_COLUMNS',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} has noticeably unbalanced columns.`,
        details: {
          title: page.title,
          deltaRatio: roundRatio(page.deltaRatio),
          leftBottomRatio: roundRatio(page.leftFillRatio),
          rightBottomRatio: roundRatio(page.rightFillRatio),
        },
      });
    }

    if (shouldFlagMissedArtOpportunity(page, units, isInterior, whitespace)) {
      findings.push({
        code: 'EXPORT_MISSED_ART_OPPORTUNITY',
        severity: 'warning',
        page: page.page,
        message: `Page ${page.page} has reclaimable blank space that should be balanced with spot art or a stronger utility band.`,
        details: {
          title: page.title,
          fillRatio: roundRatio(page.fillRatio),
          bottomGapRatio: roundRatio(whitespace.bottomGapRatio),
          deltaRatio: page.deltaRatio === null ? null : roundRatio(page.deltaRatio),
          suggestedPlacement: (page.deltaRatio ?? 0) > 0.18 ? 'column' : 'bottom_panel',
        },
      });
    }
  }

  return findings;
}

function collectMeasuredPageUnits(page: MeasuredReviewPage): Array<{
  unitId: string;
  top: number;
  bottom: number;
  textLength: number;
  hasArt: boolean;
  nodeTypes: string[];
  placements: string[];
  fragments: PageModel['pages'][number]['fragments'];
}> {
  const byUnit = new Map<string, PageModel['pages'][number]['fragments']>();
  for (const fragment of page.fragments) {
    const entry = byUnit.get(fragment.unitId) ?? [];
    entry.push(fragment);
    byUnit.set(fragment.unitId, entry);
  }

  return [...byUnit.entries()]
    .map(([unitId, fragments]) => {
      const top = Math.min(...fragments.map((fragment) => fragment.bounds.y));
      const bottom = Math.max(...fragments.map((fragment) => fragment.bounds.y + fragment.bounds.height));
      const textLength = fragments.reduce((total, fragment) => total + readNodeText(fragment.content).trim().length, 0);
      const nodeTypes = [...new Set(fragments.map((fragment) => fragment.nodeType))];
      const placements = [...new Set(fragments.map((fragment) => fragment.placement))];
      const hasArt = fragments.some((fragment) =>
        fragment.nodeType === 'fullBleedImage' || fragment.nodeType === 'mapBlock' || fragment.nodeType === 'handout',
      );

      return {
        unitId,
        top,
        bottom,
        textLength,
        hasArt,
        nodeTypes,
        placements,
        fragments,
      };
    })
    .sort((left, right) => left.top - right.top || left.bottom - right.bottom);
}

function measureMeasuredPageOverflow(
  page: MeasuredReviewPage,
  units: ReturnType<typeof collectMeasuredPageUnits>,
): {
  marginCollision: boolean;
  footerCollision: boolean;
  maxBottom: number;
  unitId: string | null;
  nodeTypes: string[];
} {
  let marginCandidate: ReturnType<typeof collectMeasuredPageUnits>[number] | null = null;
  let footerCandidate: ReturnType<typeof collectMeasuredPageUnits>[number] | null = null;

  for (const unit of units) {
    const isBottomPanelOnly = unit.placements.every((placement) => placement === 'bottom_panel');
    if (unit.bottom > page.contentHeightPx + 2) {
      if (!footerCandidate || unit.bottom > footerCandidate.bottom) footerCandidate = unit;
      continue;
    }
    if (!isBottomPanelOnly && unit.bottom > page.contentHeightPx - 6) {
      if (!marginCandidate || unit.bottom > marginCandidate.bottom) marginCandidate = unit;
    }
  }

  const candidate = footerCandidate ?? marginCandidate;
  return {
    marginCollision: Boolean(!footerCandidate && marginCandidate),
    footerCollision: Boolean(footerCandidate),
    maxBottom: candidate?.bottom ?? 0,
    unitId: candidate?.unitId ?? null,
    nodeTypes: candidate?.nodeTypes ?? [],
  };
}

function measureMeasuredPageWhitespace(
  page: MeasuredReviewPage,
  units: ReturnType<typeof collectMeasuredPageUnits>,
): {
  maxBottom: number;
  bottomGapPx: number;
  bottomGapRatio: number;
} {
  const maxBottom = units.reduce((currentMax, unit) => Math.max(currentMax, unit.bottom), 0);
  const bottomGapPx = Math.max(0, page.contentHeightPx - maxBottom);
  return {
    maxBottom,
    bottomGapPx,
    bottomGapRatio: page.contentHeightPx > 0 ? bottomGapPx / page.contentHeightPx : 0,
  };
}

function detectOrphanTailUnit(
  page: MeasuredReviewPage,
  units: ReturnType<typeof collectMeasuredPageUnits>,
): ReturnType<typeof collectMeasuredPageUnits>[number] | null {
  if (page.isOpener || page.isFullPageInsert || page.fillRatio > 0.4) return null;
  const textUnits = units.filter((unit) => !unit.hasArt);
  if (textUnits.length !== 1) return null;

  const candidate = textUnits[0];
  if (candidate.textLength <= 0 || candidate.textLength > 220) return null;
  const onlySimpleTypes = candidate.nodeTypes.every((nodeType) => (
    nodeType === 'paragraph'
    || nodeType === 'heading'
    || nodeType === 'bulletList'
    || nodeType === 'orderedList'
    || nodeType === 'readAloudBox'
    || nodeType === 'sidebarCallout'
  ));
  if (!onlySimpleTypes) return null;

  return candidate;
}

function shouldFlagMissedArtOpportunity(
  page: MeasuredReviewPage,
  units: ReturnType<typeof collectMeasuredPageUnits>,
  isInterior: boolean,
  whitespace: ReturnType<typeof measureMeasuredPageWhitespace>,
): boolean {
  if (!isInterior || page.isOpener || page.isFullPageInsert) return false;
  const hasArt = units.some((unit) => unit.hasArt);
  const largeBottomGap = whitespace.bottomGapRatio > 0.18;
  if (!largeBottomGap) return false;

  const isSparse = page.fillRatio < 0.82;
  const isUnbalanced = (page.deltaRatio ?? 0) > 0.18 && page.bottomPanelFillRatio < 0.12;
  const hasBottomPanelArt = units.some((unit) => unit.hasArt && unit.placements.includes('bottom_panel'));

  if (!hasArt) return isSparse || isUnbalanced || whitespace.bottomGapRatio > 0.2;
  if (hasBottomPanelArt && whitespace.bottomGapRatio > 0.16) return true;
  return isSparse || isUnbalanced;
}

function computeBottomPanelFillRatio(page: PageModel['pages'][number]): number {
  const bottomPanelHeight = page.fragments
    .filter((fragment) => fragment.region === 'full_width' && fragment.placement === 'bottom_panel')
    .reduce((maxHeight, fragment) => Math.max(maxHeight, fragment.bounds.y + fragment.bounds.height), 0);

  if (bottomPanelHeight <= 0 || page.contentHeightPx <= 0) return 0;
  const topEdge = page.fragments
    .filter((fragment) => fragment.region === 'full_width' && fragment.placement === 'bottom_panel')
    .reduce((minY, fragment) => Math.min(minY, fragment.bounds.y), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(topEdge)) return 0;

  return Math.max(0, bottomPanelHeight - topEdge) / page.contentHeightPx;
}

function measureColumnBalance(page: PdfPage): {
  deltaRatio: number;
  leftBottomRatio: number;
  rightBottomRatio: number;
} | null {
  if (!page.width || !page.height) return null;
  const midpoint = page.width / 2;
  const threshold = page.width * 0.08;

  const left = page.lines.filter((line) => line.xMax <= midpoint + threshold);
  const right = page.lines.filter((line) => line.xMin >= midpoint - threshold);
  if (left.length < 2 || right.length < 2) return null;

  const leftBottom = Math.max(...left.map((line) => line.yMax));
  const rightBottom = Math.max(...right.map((line) => line.yMax));

  return {
    deltaRatio: Math.abs(leftBottom - rightBottom) / page.height,
    leftBottomRatio: leftBottom / page.height,
    rightBottomRatio: rightBottom / page.height,
  };
}

function documentContainsNodeType(content: DocumentContent | null, nodeType: string): boolean {
  if (!content) return false;
  if (content.type === nodeType) return true;
  return (content.content ?? []).some((child) => documentContainsNodeType(child, nodeType));
}

function hasHeroCandidate(content: DocumentContent | null): boolean {
  return documentContainsNodeType(content, 'chapterHeader')
    || documentContainsNodeType(content, 'fullBleedImage')
    || documentContainsNodeType(content, 'mapBlock')
    || documentContainsNodeType(content, 'handout');
}

function hasEncounterPacketContent(content: DocumentContent | null): boolean {
  return documentContainsNodeType(content, 'statBlock')
    || documentContainsNodeType(content, 'encounterTable')
    || documentContainsNodeType(content, 'randomTable');
}

function hasStrongHeroPlacement(layoutPlan: LayoutPlan | null, pageModel: PageModel | null): boolean {
  if (pageModel) {
    return pageModel.fragments.some((fragment) => fragment.isHero || fragment.region === 'hero');
  }
  const blocks = Array.isArray(layoutPlan?.blocks) ? layoutPlan.blocks : [];
  return Boolean(
    blocks.some((block) => block.span === 'both_columns' && (
      block.placement === 'hero_top'
      || block.presentationOrder === 0
    )),
  );
}

function hasEncounterPacketGrouping(layoutPlan: LayoutPlan | null, pageModel: PageModel | null): boolean {
  if (pageModel) {
    const unitPages = new Map<string, Set<number>>();
    for (const fragment of pageModel.fragments) {
      if (
        !fragment.groupId?.startsWith('encounter-packet')
        && !fragment.groupId?.startsWith('utility-table')
      ) continue;
      const entry = unitPages.get(fragment.unitId) ?? new Set<number>();
      entry.add(fragment.pageIndex);
      unitPages.set(fragment.unitId, entry);
    }

    if (unitPages.size === 0) return false;
    return [...unitPages.values()].every((pages) => pages.size === 1);
  }
  const blocks = Array.isArray(layoutPlan?.blocks) ? layoutPlan.blocks : [];
  return Boolean(
    blocks.some((block) => (
      block.groupId?.startsWith('encounter-packet')
      || block.groupId?.startsWith('utility-table')
    )),
  );
}

function hasParagraphText(node: DocumentContent): boolean {
  return readNodeText(node).trim().length > 0;
}

function readNodeText(node: DocumentContent): string {
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
}

function isOversizedDisplayHeading(node: DocumentContent): boolean {
  const level = readNumberAttr(node, 'level');
  if (!Number.isFinite(level) || level < 1 || level > 2) return false;

  const text = readNodeText(node).trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return text.length >= 70 || wordCount >= 10;
}

function isStructuredUtilityParagraph(node: DocumentContent): boolean {
  const text = readNodeText(node).trim();
  if (!text) return false;

  const labelMatch = text.match(/^([^:]{3,48}):/);
  if (!labelMatch) return false;

  const label = normalizeText(labelMatch[1]);
  return [
    'combat initiation',
    'combat mechanics',
    'encounter details',
    'exploration challenge',
    'key insights include',
    'key insights',
    'potential rewards',
    'reward summary',
    'consequence summary',
    'tactics',
    'hazards',
    'checks',
    'player options',
    'options with the cursed treasure',
  ].includes(label);
}

function readStringAttr(node: DocumentContent, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function readNumberAttr(node: DocumentContent, key: string): number {
  const value = Number(node.attrs?.[key]);
  return Number.isFinite(value) ? value : Number.NaN;
}
