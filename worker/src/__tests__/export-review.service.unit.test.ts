import { describe, expect, it } from 'vitest';
import {
  analyzePdfExportLayout,
  buildUnavailableExportReview,
  finalizeExportReview,
  isBetterExportReview,
  parseBboxLayoutXhtml,
  parsePdfInfoOutput,
  planExportAutoFixes,
} from '../services/export-review.service.js';

describe('export-review.service', () => {
  it('parses pdfinfo output', () => {
    const parsed = parsePdfInfoOutput(`
Creator: Typst 0.14.2
Pages: 26
Page size: 612 x 792 pts (letter)
`);

    expect(parsed.pageCount).toBe(26);
    expect(parsed.pageWidthPts).toBe(612);
    expect(parsed.pageHeightPts).toBe(792);
  });

  it('parses bbox-layout XHTML into positioned pages and lines', () => {
    const pages = parseBboxLayoutXhtml(`
<doc>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="60.000000" xMax="220.000000" yMax="100.000000">
        <line xMin="54.000000" yMin="60.000000" xMax="220.000000" yMax="80.000000">
          <word xMin="54.000000" yMin="60.000000" xMax="120.000000" yMax="80.000000">Chapter</word>
          <word xMin="130.000000" yMin="60.000000" xMax="220.000000" yMax="80.000000">One</word>
        </line>
      </block>
    </flow>
  </page>
</doc>
`);

    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(612);
    expect(pages[0].lines[0].text).toBe('Chapter One');
  });

  it('flags weak chapter starts, wrapped titles, and sparse last pages from export-truth layout', () => {
    const pages = parseBboxLayoutXhtml(`
<doc>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="60.000000" xMax="250.000000" yMax="120.000000">
        <line xMin="54.000000" yMin="60.000000" xMax="168.000000" yMax="74.000000">
          <word xMin="54.000000" yMin="60.000000" xMax="168.000000" yMax="74.000000">Contents</word>
        </line>
        <line xMin="54.000000" yMin="92.000000" xMax="188.000000" yMax="110.000000">
          <word xMin="54.000000" yMin="92.000000" xMax="108.000000" yMax="110.000000">The</word>
          <word xMin="116.000000" yMin="92.000000" xMax="188.000000" yMax="110.000000">Ashfeld</word>
        </line>
      </block>
    </flow>
  </page>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="58.000000" xMax="296.000000" yMax="98.000000">
        <line xMin="54.000000" yMin="58.000000" xMax="296.000000" yMax="77.000000">
          <word xMin="54.000000" yMin="58.000000" xMax="116.000000" yMax="77.000000">Chapter</word>
          <word xMin="128.000000" yMin="58.000000" xMax="140.000000" yMax="77.000000">1</word>
          <word xMin="152.000000" yMin="58.000000" xMax="182.000000" yMax="77.000000">The</word>
          <word xMin="194.000000" yMin="58.000000" xMax="255.000000" yMax="77.000000">Ashfeld</word>
          <word xMin="267.000000" yMin="58.000000" xMax="296.000000" yMax="77.000000">Ap&#173;</word>
        </line>
        <line xMin="54.000000" yMin="78.000000" xMax="108.000000" yMax="97.000000">
          <word xMin="54.000000" yMin="78.000000" xMax="108.000000" yMax="97.000000">proach</word>
        </line>
      </block>
    </flow>
  </page>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="300.000000" xMax="256.000000" yMax="352.000000">
        <line xMin="54.000000" yMin="300.000000" xMax="132.000000" yMax="318.000000">
          <word xMin="54.000000" yMin="300.000000" xMax="132.000000" yMax="318.000000">Chapter</word>
        </line>
        <line xMin="54.000000" yMin="320.000000" xMax="256.000000" yMax="352.000000">
          <word xMin="54.000000" yMin="320.000000" xMax="106.000000" yMax="352.000000">Into</word>
          <word xMin="118.000000" yMin="320.000000" xMax="162.000000" yMax="352.000000">the</word>
          <word xMin="174.000000" yMin="320.000000" xMax="256.000000" yMax="352.000000">Wilds</word>
        </line>
      </block>
      <block xMin="54.000000" yMin="370.000000" xMax="210.000000" yMax="390.000000">
        <line xMin="54.000000" yMin="370.000000" xMax="210.000000" yMax="390.000000">
          <word xMin="54.000000" yMin="370.000000" xMax="210.000000" yMax="390.000000">A short final note.</word>
        </line>
      </block>
    </flow>
  </page>
</doc>
`);

    const review = analyzePdfExportLayout({
      documents: [
        { title: 'The Ashfeld Approach', kind: 'chapter' },
        { title: 'Into the Wilds', kind: 'chapter' },
      ],
      pages,
      pageCount: 3,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.status).toBe('needs_attention');
    expect(review.findings.map((finding) => finding.code)).toEqual([
      'EXPORT_SECTION_TITLE_WRAP',
      'EXPORT_CHAPTER_OPENER_LOW',
      'EXPORT_LAST_PAGE_UNDERFILLED',
    ]);
    expect(review.metrics.sectionStarts[0].page).toBe(2);
    expect(review.metrics.sectionStarts[1].page).toBe(3);
    expect(review.metrics.sectionStarts[0].hyphenated).toBe(true);
  });

  it('builds an unavailable review payload when review tooling fails', () => {
    const review = buildUnavailableExportReview('missing pdftotext');
    expect(review.status).toBe('unavailable');
    expect(review.findings[0].code).toBe('EXPORT_REVIEW_UNAVAILABLE');
    expect(review.passCount).toBe(1);
    expect(review.appliedFixes).toEqual([]);
  });

  it('plans deterministic export auto-fixes from review findings', () => {
    const review = analyzePdfExportLayout({
      documents: [],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    const fixes = planExportAutoFixes({
      ...review,
      findings: [
        {
          code: 'EXPORT_CHAPTER_OPENER_LOW',
          severity: 'warning',
          page: 6,
          message: 'Low chapter opener',
          details: null,
        },
        {
          code: 'EXPORT_SECTION_TITLE_WRAP',
          severity: 'warning',
          page: 2,
          message: 'Wrapped title',
          details: null,
        },
        {
          code: 'EXPORT_LAST_PAGE_UNDERFILLED',
          severity: 'warning',
          page: 12,
          message: 'Sparse last page',
          details: null,
        },
      ],
    });

    expect(fixes).toEqual([
      'shrink_h1_headings',
      'dedicated_chapter_openers',
      'dedicated_end_page',
    ]);
  });

  it('compares export reviews by status, score, then finding count', () => {
    const baseline = {
      ...buildUnavailableExportReview('missing tooling'),
      status: 'needs_attention' as const,
      score: 60,
      findings: [
        {
          code: 'EXPORT_SECTION_TITLE_WRAP' as const,
          severity: 'warning' as const,
          page: 2,
          message: 'Wrapped title',
          details: null,
        },
      ],
    };

    const improved = {
      ...baseline,
      status: 'passed' as const,
      score: 85,
      findings: [],
    };

    expect(isBetterExportReview(improved, baseline)).toBe(true);
    expect(isBetterExportReview(baseline, improved)).toBe(false);
  });

  it('finalizes review metadata after a second export pass', () => {
    const review = finalizeExportReview(
      {
        ...buildUnavailableExportReview('missing tooling'),
        status: 'passed',
        score: 92,
        summary: 'Export review passed across 26 pages.',
        findings: [],
      },
      ['shrink_h1_headings'],
      2
    );

    expect(review.passCount).toBe(2);
    expect(review.appliedFixes).toEqual(['shrink_h1_headings']);
    expect(review.summary).toContain('Applied 1 export auto-fix');
  });
});
