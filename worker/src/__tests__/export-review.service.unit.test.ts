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

  it('matches chapter titles without penalizing a clean two-line chapter opener', () => {
    const pages = parseBboxLayoutXhtml(`
<doc>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="52.000000" xMax="280.000000" yMax="118.000000">
        <line xMin="54.000000" yMin="52.000000" xMax="132.000000" yMax="68.000000">
          <word xMin="54.000000" yMin="52.000000" xMax="102.000000" yMax="68.000000">Chapter</word>
          <word xMin="108.000000" yMin="52.000000" xMax="132.000000" yMax="68.000000">2</word>
        </line>
        <line xMin="54.000000" yMin="76.000000" xMax="240.000000" yMax="102.000000">
          <word xMin="54.000000" yMin="76.000000" xMax="184.000000" yMax="102.000000">Approaching</word>
          <word xMin="192.000000" yMin="76.000000" xMax="240.000000" yMax="102.000000">the</word>
        </line>
        <line xMin="54.000000" yMin="104.000000" xMax="152.000000" yMax="130.000000">
          <word xMin="54.000000" yMin="104.000000" xMax="152.000000" yMax="130.000000">Mine</word>
        </line>
      </block>
      <block xMin="54.000000" yMin="160.000000" xMax="280.000000" yMax="178.000000">
        <line xMin="54.000000" yMin="160.000000" xMax="280.000000" yMax="178.000000">
          <word xMin="54.000000" yMin="160.000000" xMax="280.000000" yMax="178.000000">Body text continues here.</word>
        </line>
      </block>
    </flow>
  </page>
</doc>
`);

    const review = analyzePdfExportLayout({
      documents: [
        { title: 'Chapter 2: Approaching the Mine', kind: 'chapter' },
      ],
      pages,
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.metrics.sectionStarts[0].page).toBe(1);
    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_SECTION_TITLE_WRAP');
  });

  it('flags broken utility blocks directly from exported document content', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 1: Broken Tools',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'randomTable',
                attrs: {
                  title: 'Hidden Path Discoveries',
                  dieType: 'd6',
                  entries: '[]',
                },
              },
              {
                type: 'encounterTable',
                attrs: {
                  environment: 'Underdark trail',
                  crRange: '1-4',
                  entries: '[]',
                },
              },
              {
                type: 'statBlock',
                attrs: {
                  name: 'Enchanted Guardian',
                  ac: 0,
                  hp: 0,
                },
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_EMPTY_RANDOM_TABLE');
    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_EMPTY_ENCOUNTER_TABLE');
    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_PLACEHOLDER_STAT_BLOCK');
    expect(review.metrics.utilityCoverage[0].referenceBlockCount).toBe(3);
  });

  it('flags short-book TOCs, weak hero placement, split packets, and page whitespace/layout imbalance', () => {
    const pages = parseBboxLayoutXhtml(`
<doc>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="60.000000" xMax="250.000000" yMax="120.000000">
        <line xMin="54.000000" yMin="60.000000" xMax="188.000000" yMax="80.000000">
          <word xMin="54.000000" yMin="60.000000" xMax="188.000000" yMax="80.000000">Table of Contents</word>
        </line>
      </block>
    </flow>
  </page>
  <page width="612.000000" height="792.000000">
    <flow>
      <block xMin="54.000000" yMin="90.000000" xMax="170.000000" yMax="150.000000">
        <line xMin="54.000000" yMin="90.000000" xMax="170.000000" yMax="110.000000">
          <word xMin="54.000000" yMin="90.000000" xMax="170.000000" yMax="110.000000">Sparse left column</word>
        </line>
        <line xMin="54.000000" yMin="120.000000" xMax="170.000000" yMax="140.000000">
          <word xMin="54.000000" yMin="120.000000" xMax="170.000000" yMax="140.000000">Still sparse</word>
        </line>
      </block>
      <block xMin="360.000000" yMin="90.000000" xMax="520.000000" yMax="420.000000">
        <line xMin="360.000000" yMin="90.000000" xMax="520.000000" yMax="110.000000">
          <word xMin="360.000000" yMin="90.000000" xMax="520.000000" yMax="110.000000">Dense right column</word>
        </line>
        <line xMin="360.000000" yMin="200.000000" xMax="520.000000" yMax="220.000000">
          <word xMin="360.000000" yMin="200.000000" xMax="520.000000" yMax="220.000000">More text</word>
        </line>
        <line xMin="360.000000" yMin="300.000000" xMax="520.000000" yMax="320.000000">
          <word xMin="360.000000" yMin="300.000000" xMax="520.000000" yMax="320.000000">More text</word>
        </line>
        <line xMin="360.000000" yMin="400.000000" xMax="520.000000" yMax="420.000000">
          <word xMin="360.000000" yMin="400.000000" xMax="520.000000" yMax="420.000000">More text</word>
        </line>
      </block>
    </flow>
  </page>
</doc>
`);

    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Front Matter',
          kind: 'front_matter',
          content: {
            type: 'doc',
            content: [{ type: 'tableOfContents', attrs: { title: 'Contents' } }],
          },
        },
        {
          title: 'Into the Mine',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              { type: 'chapterHeader', attrs: { title: 'Into the Mine', backgroundImage: '/uploads/bg.png' } },
              { type: 'statBlock', attrs: { name: 'Phantom Apparition', ac: 13, hp: 10 } },
            ],
          },
          layoutPlan: {
            version: 1,
            sectionRecipe: 'chapter_hero_split',
            columnBalanceTarget: 'balanced',
            blocks: [
              {
                nodeId: 'chapter-header',
                presentationOrder: 0,
                span: 'column',
                placement: 'inline',
                groupId: null,
                keepTogether: true,
                allowWrapBelow: false,
              },
              {
                nodeId: 'stat-block',
                presentationOrder: 1,
                span: 'column',
                placement: 'inline',
                groupId: null,
                keepTogether: true,
                allowWrapBelow: false,
              },
            ],
          },
        },
      ],
      pages,
      pageCount: 2,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    const codes = review.findings.map((finding) => finding.code);
    expect(codes).toContain('EXPORT_OVERLONG_TOC_FOR_SHORT_BOOK');
    expect(codes).toContain('EXPORT_WEAK_HERO_PLACEMENT');
    expect(codes).toContain('EXPORT_SPLIT_SCENE_PACKET');
    expect(codes).toContain('EXPORT_UNBALANCED_COLUMNS');
  });

  it('flags thin random encounter tables that are not runnable enough for a DM', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: Into the Mine',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'randomTable',
                attrs: {
                  title: 'Mine Encounters',
                  dieType: 'd6',
                  entries: JSON.stringify([
                    { roll: '1-2', result: '2d4 shadows' },
                    { roll: '3-4', result: 'A miner spirit' },
                    { roll: '5-6', result: 'Collapsed tunnel' },
                  ]),
                },
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_THIN_RANDOM_TABLE');
  });

  it('does not flag detailed random encounter tables that include operational detail', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: Into the Mine',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'randomTable',
                attrs: {
                  title: 'Mine Encounters',
                  dieType: 'd6',
                  entries: JSON.stringify([
                    { roll: '1-2', result: 'A sobbing miner spirit warns the party about unstable beams; a DC 12 Insight check reveals the safest route and grants advantage on the next hazard check.' },
                    { roll: '3-4', result: 'Two shadows peel off the cavern wall and stalk the rear guard; if driven off, they leave behind a blackglass shard worth 15 gp.' },
                  ]),
                },
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_THIN_RANDOM_TABLE');
  });

  it('flags suspicious but non-placeholder stat blocks for manual review', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: Phantom Threats',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'statBlock',
                attrs: {
                  name: 'Phantom Apparition',
                  ac: 13,
                  hp: 10,
                  speed: '0 ft., fly 40 ft. (hover)',
                  str: 10,
                  dex: 10,
                  con: 10,
                  int: 10,
                  wis: 10,
                  cha: 10,
                },
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_SUSPICIOUS_STAT_BLOCK');
  });

  it('flags prose-heavy chapters with weak utility density', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: Too Much Lore',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: Array.from({ length: 6 }, (_, index) => ({
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Paragraph ${index + 1} expands on mood and backstory without adding a usable reference block.`,
                },
              ],
            })),
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_LOW_UTILITY_DENSITY');
    expect(review.metrics.utilityCoverage[0].utilityDensity).toBe(0);
  });

  it('credits structured utility prose and bullet lists when measuring utility density', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: Into the Mine',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Exploration Challenge: Choose which tunnel the party investigates first.' }],
              },
              {
                type: 'bulletList',
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Path 1: A glow suggests useful lore deeper in the mine.' }] }],
                  },
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Path 2: Sobs draw the party toward a dangerous spirit.' }] }],
                  },
                ],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Consequence Summary: Success reveals a shortcut while failure draws hostile phantoms.' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'A short connective paragraph keeps the scene moving.' }],
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_LOW_UTILITY_DENSITY');
    expect(review.metrics.utilityCoverage[0].utilityDensity).toBeGreaterThan(0.14);
  });

  it('flags malformed oversized display headings in chapter content', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 5: The Artifact',
          kind: 'chapter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'heading',
                attrs: { level: 1 },
                content: [
                  {
                    type: 'text',
                    text: 'The Shadow Prism An ancient artifact of immense power that can control shadows but corrupts its wielder.',
                  },
                ],
              },
            ],
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_OVERSIZED_DISPLAY_HEADING');
  });

  it('builds an unavailable review payload when review tooling fails', () => {
    const review = buildUnavailableExportReview('missing pdftotext');
    expect(review.status).toBe('unavailable');
    expect(review.findings[0].code).toBe('EXPORT_REVIEW_UNAVAILABLE');
    expect(review.passCount).toBe(1);
    expect(review.appliedFixes).toEqual([]);
    expect(review.metrics.utilityCoverage).toEqual([]);
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
      'refresh_layout_plan',
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
