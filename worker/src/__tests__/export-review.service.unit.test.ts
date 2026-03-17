import { describe, expect, it } from 'vitest';
import {
  analyzePdfExportLayout,
  buildUnavailableExportReview,
  finalizeExportReview,
  isBetterExportReview,
  parseBboxLayoutXhtml,
  parsePdfInfoOutput,
  planExportAutoFixes,
  reviewMeasuredExportLayout,
} from '../services/export-review.service.js';
import type { PageModel } from '@dnd-booker/shared';

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

  it('uses measured page models for chapter starts instead of front-matter text mentions', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'DM Brief',
          kind: 'front_matter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Chapter 2: Approaching the Mine is where the danger escalates.' }],
              },
            ],
          },
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'intro_split_spread', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'intro_split_spread',
              fragments: [],
              contentHeightPx: 864,
              fillRatio: 0.6,
              columnMetrics: { leftFillRatio: 0.6, rightFillRatio: null, deltaRatio: null },
              nodeIds: [],
              documentIds: ['DM Brief'],
              openerDocumentId: null,
            }],
            fragments: [],
            metrics: { fragmentCount: 0, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 0, pageCount: 1 },
          },
        },
        {
          title: 'Approaching the Mine',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [
                {
                  nodeId: 'chapter-header',
                  sourceIndex: 0,
                  presentationOrder: 0,
                  span: 'both_columns',
                  placement: 'hero_top',
                  groupId: null,
                  keepTogether: true,
                  allowWrapBelow: true,
                  nodeType: 'chapterHeader',
                  content: { type: 'chapterHeader', attrs: { title: 'Approaching the Mine' } },
                  unitId: 'unit:chapter-header',
                  pageIndex: 1,
                  columnIndex: null,
                  region: 'hero',
                  bounds: { x: 0, y: 24, width: 672, height: 220 },
                  isHero: true,
                  isOpener: true,
                },
              ],
              contentHeightPx: 864,
              fillRatio: 0.72,
              columnMetrics: { leftFillRatio: 0.72, rightFillRatio: 0.68, deltaRatio: 0.04 },
              nodeIds: ['chapter-header'],
              documentIds: ['Approaching the Mine'],
              openerDocumentId: 'Approaching the Mine',
            }],
            fragments: [
              {
                nodeId: 'chapter-header',
                sourceIndex: 0,
                presentationOrder: 0,
                span: 'both_columns',
                placement: 'hero_top',
                groupId: null,
                keepTogether: true,
                allowWrapBelow: true,
                nodeType: 'chapterHeader',
                content: { type: 'chapterHeader', attrs: { title: 'Approaching the Mine' } },
                unitId: 'unit:chapter-header',
                pageIndex: 1,
                columnIndex: null,
                region: 'hero',
                bounds: { x: 0, y: 24, width: 672, height: 220 },
                isHero: true,
                isOpener: true,
              },
            ],
            metrics: { fragmentCount: 1, heroFragmentCount: 1, groupedFragmentCount: 0, keepTogetherCount: 1, pageCount: 1 },
          },
        },
      ],
      pages: [],
      pageCount: 2,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.metrics.sectionStarts[0].page).toBe(2);
    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_CHAPTER_OPENER_LOW');
  });

  it('flags a visually airy interior page with no art as a missed art opportunity before export', () => {
    const pageModel: PageModel = {
      preset: 'standard_pdf',
      flow: {
        preset: 'standard_pdf',
        sectionRecipe: 'chapter_hero_split',
        columnBalanceTarget: 'balanced',
        fragments: [],
        units: [],
      },
      pages: [
        {
          index: 1,
          preset: 'standard_pdf',
          recipe: 'chapter_hero_split',
          fragments: [],
          contentHeightPx: 864,
          fillRatio: 0.88,
          columnMetrics: { leftFillRatio: 0.88, rightFillRatio: 0.84, deltaRatio: 0.04 },
          nodeIds: [],
          documentIds: ['Chapter 1: The Town'],
          openerDocumentId: 'Chapter 1: The Town',
        },
        {
          index: 2,
          preset: 'standard_pdf',
          recipe: 'chapter_hero_split',
          fragments: [
            {
              nodeId: 'intro-a',
              sourceIndex: 0,
              presentationOrder: 0,
              span: 'column',
              placement: 'inline',
              groupId: null,
              keepTogether: false,
              allowWrapBelow: false,
              nodeType: 'paragraph',
              content: { type: 'paragraph', content: [{ type: 'text', text: 'Short opener text.' }] },
              unitId: 'unit:intro-a',
              pageIndex: 2,
              columnIndex: 1,
              region: 'column_left',
              bounds: { x: 0, y: 0, width: 320, height: 120 },
              isHero: false,
              isOpener: false,
            },
            {
              nodeId: 'intro-b',
              sourceIndex: 1,
              presentationOrder: 1,
              span: 'column',
              placement: 'inline',
              groupId: null,
              keepTogether: false,
              allowWrapBelow: false,
              nodeType: 'bulletList',
              content: { type: 'bulletList', content: [] },
              unitId: 'unit:intro-b',
              pageIndex: 2,
              columnIndex: 2,
              region: 'column_right',
              bounds: { x: 340, y: 0, width: 320, height: 170 },
              isHero: false,
              isOpener: false,
            },
          ],
          contentHeightPx: 864,
          fillRatio: 0.73,
          columnMetrics: { leftFillRatio: 0.5, rightFillRatio: 0.55, deltaRatio: 0.05 },
          nodeIds: ['intro-a', 'intro-b'],
          documentIds: ['Chapter 1: The Town'],
          openerDocumentId: null,
        },
        {
          index: 3,
          preset: 'standard_pdf',
          recipe: 'chapter_hero_split',
          fragments: [],
          contentHeightPx: 864,
          fillRatio: 0.64,
          columnMetrics: { leftFillRatio: 0.64, rightFillRatio: 0.58, deltaRatio: 0.06 },
          nodeIds: [],
          documentIds: ['Chapter 1: The Town'],
          openerDocumentId: null,
        },
      ],
      fragments: [
        {
          nodeId: 'intro-a',
          sourceIndex: 0,
          presentationOrder: 0,
          span: 'column',
          placement: 'inline',
          groupId: null,
          keepTogether: false,
          allowWrapBelow: false,
          nodeType: 'paragraph',
          content: { type: 'paragraph', content: [{ type: 'text', text: 'Short opener text.' }] },
          unitId: 'unit:intro-a',
          pageIndex: 2,
          columnIndex: 1,
          region: 'column_left',
          bounds: { x: 0, y: 0, width: 320, height: 120 },
          isHero: false,
          isOpener: false,
        },
        {
          nodeId: 'intro-b',
          sourceIndex: 1,
          presentationOrder: 1,
          span: 'column',
          placement: 'inline',
          groupId: null,
          keepTogether: false,
          allowWrapBelow: false,
          nodeType: 'bulletList',
          content: { type: 'bulletList', content: [] },
          unitId: 'unit:intro-b',
          pageIndex: 2,
          columnIndex: 2,
          region: 'column_right',
          bounds: { x: 340, y: 0, width: 320, height: 170 },
          isHero: false,
          isOpener: false,
        },
      ],
      metrics: {
        fragmentCount: 2,
        heroFragmentCount: 0,
        groupedFragmentCount: 0,
        keepTogetherCount: 0,
        pageCount: 3,
      },
    };

    const review = reviewMeasuredExportLayout({
      documents: [
        { title: 'Chapter 1: The Town', kind: 'chapter', pageModel },
      ],
      pageCount: 3,
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_MISSED_ART_OPPORTUNITY');
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

  it('does not flag unbalanced columns when a substantial bottom utility band is present', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Front Matter',
          kind: 'front_matter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'intro_split_spread', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'intro_split_spread',
              fragments: [
                {
                  nodeId: 'left-copy',
                  sourceIndex: 0,
                  presentationOrder: 0,
                  span: 'column',
                  placement: 'inline',
                  groupId: null,
                  keepTogether: false,
                  allowWrapBelow: false,
                  nodeType: 'paragraph',
                  content: { type: 'paragraph', content: [{ type: 'text', text: 'Left column.' }] },
                  unitId: 'unit:left-copy',
                  pageIndex: 1,
                  columnIndex: 1,
                  region: 'column_left',
                  bounds: { x: 0, y: 0, width: 320, height: 260 },
                  isHero: false,
                  isOpener: false,
                },
                {
                  nodeId: 'right-copy',
                  sourceIndex: 1,
                  presentationOrder: 1,
                  span: 'column',
                  placement: 'inline',
                  groupId: null,
                  keepTogether: false,
                  allowWrapBelow: false,
                  nodeType: 'paragraph',
                  content: { type: 'paragraph', content: [{ type: 'text', text: 'Right column.' }] },
                  unitId: 'unit:right-copy',
                  pageIndex: 1,
                  columnIndex: 2,
                  region: 'column_right',
                  bounds: { x: 336, y: 0, width: 320, height: 420 },
                  isHero: false,
                  isOpener: false,
                },
                {
                  nodeId: 'utility-heading',
                  sourceIndex: 2,
                  presentationOrder: 2,
                  span: 'both_columns',
                  placement: 'bottom_panel',
                  groupId: 'intro-tail-panel-1',
                  keepTogether: true,
                  allowWrapBelow: false,
                  nodeType: 'heading',
                  content: { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Prep Checklist' }] },
                  unitId: 'group:intro-tail-panel-1',
                  pageIndex: 1,
                  columnIndex: null,
                  region: 'full_width',
                  bounds: { x: 0, y: 460, width: 672, height: 170 },
                  isHero: false,
                  isOpener: false,
                },
              ],
              contentHeightPx: 864,
              fillRatio: 0.73,
              columnMetrics: { leftFillRatio: 0.31, rightFillRatio: 0.49, deltaRatio: 0.18 },
              nodeIds: ['left-copy', 'right-copy', 'utility-heading'],
              documentIds: ['Front Matter'],
              openerDocumentId: null,
            }],
            fragments: [],
            metrics: { fragmentCount: 3, heroFragmentCount: 0, groupedFragmentCount: 1, keepTogetherCount: 1, pageCount: 1 },
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_UNBALANCED_COLUMNS');
  });

  it('does not flag visually acceptable near-full pages or substantial bottom-panel art recovery as sparse failures', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 1: The Town',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [
              {
                index: 1,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'scene-copy',
                    sourceIndex: 0,
                    presentationOrder: 0,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: false,
                    allowWrapBelow: false,
                    nodeType: 'paragraph',
                    content: { type: 'paragraph', content: [{ type: 'text', text: 'Town scene copy.' }] },
                    unitId: 'unit:scene-copy',
                    pageIndex: 1,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 320, height: 608 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.705,
                columnMetrics: { leftFillRatio: 0.705, rightFillRatio: 0.687, deltaRatio: 0.018 },
                nodeIds: ['scene-copy'],
                documentIds: ['Chapter 1: The Town'],
                openerDocumentId: null,
              },
              {
                index: 2,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'closing-copy',
                    sourceIndex: 1,
                    presentationOrder: 1,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: false,
                    allowWrapBelow: false,
                    nodeType: 'paragraph',
                    content: { type: 'paragraph', content: [{ type: 'text', text: 'Closing rumors and a final uneasy reflection.' }] },
                    unitId: 'unit:closing-copy',
                    pageIndex: 2,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 320, height: 220 },
                    isHero: false,
                    isOpener: false,
                  },
                  {
                    nodeId: 'repair-art',
                    sourceIndex: 2,
                    presentationOrder: 2,
                    span: 'both_columns',
                    placement: 'bottom_panel',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: false,
                    nodeType: 'fullBleedImage',
                    content: { type: 'fullBleedImage', attrs: { artRole: 'sparse_page_repair', src: '/uploads/repair.png' } },
                    unitId: 'unit:repair-art',
                    pageIndex: 2,
                    columnIndex: null,
                    region: 'full_width',
                    bounds: { x: 0, y: 250, width: 672, height: 350 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.695,
                columnMetrics: { leftFillRatio: 0.695, rightFillRatio: 0.52, deltaRatio: 0.175 },
                nodeIds: ['closing-copy', 'repair-art'],
                documentIds: ['Chapter 1: The Town'],
                openerDocumentId: null,
              },
            ],
            fragments: [],
            metrics: { fragmentCount: 3, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 1, pageCount: 2 },
          },
        },
      ],
      pages: [],
      pageCount: 2,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    const codes = review.findings.map((finding) => finding.code);
    expect(codes).not.toContain('EXPORT_UNUSED_PAGE_REGION');
    expect(codes).not.toContain('EXPORT_MISSED_ART_OPPORTUNITY');
  });

  it('flags footer collisions, orphan tail pages, and missed art opportunities from measured geometry', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Chapter 2: The Mine',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [
              {
                index: 1,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'chapter-header',
                    sourceIndex: 0,
                    presentationOrder: 0,
                    span: 'both_columns',
                    placement: 'hero_top',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: true,
                    nodeType: 'chapterHeader',
                    content: { type: 'chapterHeader', attrs: { title: 'The Mine' } },
                    unitId: 'unit:chapter-header',
                    pageIndex: 1,
                    columnIndex: null,
                    region: 'hero',
                    bounds: { x: 0, y: 16, width: 672, height: 220 },
                    isHero: true,
                    isOpener: true,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.72,
                columnMetrics: { leftFillRatio: 0.72, rightFillRatio: 0.68, deltaRatio: 0.04 },
                nodeIds: ['chapter-header'],
                documentIds: ['Chapter 2: The Mine'],
                openerDocumentId: 'Chapter 2: The Mine',
              },
              {
                index: 2,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'npc-card',
                    sourceIndex: 1,
                    presentationOrder: 1,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: false,
                    nodeType: 'npcProfile',
                    content: { type: 'npcProfile', attrs: { name: 'Mayor Aldric' } },
                    unitId: 'unit:npc-card',
                    pageIndex: 2,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 320, height: 876 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.82,
                columnMetrics: { leftFillRatio: 0.82, rightFillRatio: 0.18, deltaRatio: 0.64 },
                nodeIds: ['npc-card'],
                documentIds: ['Chapter 2: The Mine'],
                openerDocumentId: null,
              },
              {
                index: 3,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'tail-paragraph',
                    sourceIndex: 2,
                    presentationOrder: 2,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: false,
                    allowWrapBelow: false,
                    nodeType: 'paragraph',
                    content: { type: 'paragraph', content: [{ type: 'text', text: 'A final omen lingers in the air.' }] },
                    unitId: 'unit:tail-paragraph',
                    pageIndex: 3,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 320, height: 72 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.18,
                columnMetrics: { leftFillRatio: 0.18, rightFillRatio: 0.02, deltaRatio: 0.16 },
                nodeIds: ['tail-paragraph'],
                documentIds: ['Chapter 2: The Mine'],
                openerDocumentId: null,
              },
              {
                index: 4,
                preset: 'standard_pdf',
                recipe: 'chapter_hero_split',
                fragments: [
                  {
                    nodeId: 'closing-copy',
                    sourceIndex: 3,
                    presentationOrder: 3,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: false,
                    allowWrapBelow: false,
                    nodeType: 'paragraph',
                    content: { type: 'paragraph', content: [{ type: 'text', text: 'Closing copy fills the last page well enough.' }] },
                    unitId: 'unit:closing-copy',
                    pageIndex: 4,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 320, height: 280 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 864,
                fillRatio: 0.58,
                columnMetrics: { leftFillRatio: 0.58, rightFillRatio: 0.42, deltaRatio: 0.16 },
                nodeIds: ['closing-copy'],
                documentIds: ['Chapter 2: The Mine'],
                openerDocumentId: null,
              },
            ],
            fragments: [],
            metrics: { fragmentCount: 4, heroFragmentCount: 1, groupedFragmentCount: 0, keepTogetherCount: 2, pageCount: 4 },
          },
        },
      ],
      pages: [],
      pageCount: 4,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    const codes = review.findings.map((finding) => finding.code);
    expect(codes).toContain('EXPORT_FOOTER_COLLISION');
    expect(codes).toContain('EXPORT_ORPHAN_TAIL_PARAGRAPH');
    expect(codes).toContain('EXPORT_MISSED_ART_OPPORTUNITY');
  });

  it('does not flag a title-page opener as a margin or footer collision', () => {
    const review = analyzePdfExportLayout({
      documents: [
        {
          title: 'Front Matter',
          kind: 'front_matter',
          content: {
            type: 'doc',
            content: [
              {
                type: 'titlePage',
                attrs: {
                  title: 'The Blackglass Mine',
                },
              },
            ],
          },
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'intro_split_spread', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [
              {
                index: 1,
                preset: 'standard_pdf',
                recipe: 'intro_split_spread',
                fragments: [
                  {
                    nodeId: 'title-page',
                    sourceIndex: 0,
                    presentationOrder: 0,
                    span: 'both_columns',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: false,
                    nodeType: 'titlePage',
                    content: {
                      type: 'titlePage',
                      attrs: {
                        title: 'The Blackglass Mine',
                      },
                    },
                    unitId: 'unit:title-page',
                    pageIndex: 1,
                    columnIndex: null,
                    region: 'full_width',
                    bounds: { x: 0, y: 0, width: 696, height: 880 },
                    isHero: false,
                    isOpener: true,
                  },
                ],
                contentHeightPx: 880,
                fillRatio: 1,
                columnMetrics: { leftFillRatio: 1, rightFillRatio: null, deltaRatio: null },
                nodeIds: ['title-page'],
                documentIds: ['Front Matter'],
                openerDocumentId: 'Front Matter',
              },
            ],
            fragments: [],
            metrics: { fragmentCount: 1, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 1, pageCount: 1 },
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    const codes = review.findings.map((finding) => finding.code);
    expect(codes).not.toContain('EXPORT_MARGIN_COLLISION');
    expect(codes).not.toContain('EXPORT_FOOTER_COLLISION');
  });

  it('does not flag split scene packets when utility-table grouping is present', () => {
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
                    { roll: '1-2', result: 'Mine creepers strike from the dark.' },
                    { roll: '3-4', result: 'A cursed cache tempts the party.' },
                  ]),
                },
              },
            ],
          },
          layoutPlan: {
            version: 1,
            sectionRecipe: 'chapter_hero_split',
            columnBalanceTarget: 'balanced',
            blocks: [
              {
                nodeId: 'mine-table',
                presentationOrder: 0,
                span: 'column',
                placement: 'side_panel',
                groupId: 'utility-table-1',
                keepTogether: true,
                allowWrapBelow: false,
              },
            ],
          },
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [
                {
                  nodeId: 'mine-table',
                  sourceIndex: 0,
                  presentationOrder: 0,
                  span: 'column',
                  placement: 'side_panel',
                  groupId: 'utility-table-1',
                  keepTogether: true,
                  allowWrapBelow: false,
                  nodeType: 'randomTable',
                  content: {
                    type: 'randomTable',
                    attrs: { title: 'Mine Encounters', dieType: 'd6', entries: '[]' },
                  },
                  unitId: 'group:utility-table-1',
                  pageIndex: 1,
                  columnIndex: 0,
                  region: 'column_left',
                  bounds: { x: 0, y: 120, width: 320, height: 320 },
                  isHero: false,
                  isOpener: false,
                },
              ],
              contentHeightPx: 864,
              fillRatio: 0.72,
              columnMetrics: { leftFillRatio: 0.72, rightFillRatio: 0.61, deltaRatio: 0.11 },
              nodeIds: ['mine-table'],
              documentIds: ['Chapter 2: Into the Mine'],
              openerDocumentId: null,
            }],
            fragments: [
              {
                nodeId: 'mine-table',
                sourceIndex: 0,
                presentationOrder: 0,
                span: 'column',
                placement: 'side_panel',
                groupId: 'utility-table-1',
                keepTogether: true,
                allowWrapBelow: false,
                nodeType: 'randomTable',
                content: {
                  type: 'randomTable',
                  attrs: { title: 'Mine Encounters', dieType: 'd6', entries: '[]' },
                },
                unitId: 'group:utility-table-1',
                pageIndex: 1,
                columnIndex: 0,
                region: 'column_left',
                bounds: { x: 0, y: 120, width: 320, height: 320 },
                isHero: false,
                isOpener: false,
              },
            ],
            metrics: { fragmentCount: 1, heroFragmentCount: 0, groupedFragmentCount: 1, keepTogetherCount: 1, pageCount: 1 },
          },
        },
      ],
      pages: [],
      pageCount: 1,
      pageWidthPts: 612,
      pageHeightPts: 792,
    });

    expect(review.findings.map((finding) => finding.code)).not.toContain('EXPORT_SPLIT_SCENE_PACKET');
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

  it('flags missed art opportunities on measured pages with large trailing blank space', () => {
    const review = reviewMeasuredExportLayout({
      documents: [
        {
          title: 'Front Matter',
          kind: 'front_matter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'intro_split_spread', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [
              {
                index: 1,
                preset: 'standard_pdf',
                recipe: 'intro_split_spread',
                fragments: [
                  {
                    nodeId: 'title-page',
                    sourceIndex: 0,
                    presentationOrder: 0,
                    span: 'full_page',
                    placement: 'full_page_insert',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: false,
                    nodeType: 'titlePage',
                    content: { type: 'titlePage', attrs: { title: 'The Blackglass Mine' } },
                    unitId: 'unit:title-page',
                    pageIndex: 1,
                    columnIndex: null,
                    region: 'full_page',
                    bounds: { x: 0, y: 0, width: 530, height: 900 },
                    isHero: false,
                    isOpener: true,
                  },
                ],
                contentHeightPx: 900,
                fillRatio: 1,
                columnMetrics: { leftFillRatio: 1, rightFillRatio: 1, deltaRatio: 0 },
                nodeIds: ['title-page'],
                documentIds: ['Front Matter'],
                openerDocumentId: 'Front Matter',
              },
              {
                index: 2,
                preset: 'standard_pdf',
                recipe: 'intro_split_spread',
                fragments: [
                  {
                    nodeId: 'heading-1',
                    sourceIndex: 0,
                    presentationOrder: 0,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: true,
                    allowWrapBelow: false,
                    nodeType: 'heading',
                    content: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'DM Brief' }] },
                    unitId: 'unit:heading-1',
                    pageIndex: 2,
                    columnIndex: 1,
                    region: 'column_left',
                    bounds: { x: 0, y: 0, width: 250, height: 120 },
                    isHero: false,
                    isOpener: false,
                  },
                  {
                    nodeId: 'paragraph-1',
                    sourceIndex: 1,
                    presentationOrder: 1,
                    span: 'column',
                    placement: 'inline',
                    groupId: null,
                    keepTogether: false,
                    allowWrapBelow: false,
                    nodeType: 'paragraph',
                    content: { type: 'paragraph', content: [{ type: 'text', text: 'Setup copy for the Dungeon Master.' }] },
                    unitId: 'unit:paragraph-1',
                    pageIndex: 2,
                    columnIndex: 2,
                    region: 'column_right',
                    bounds: { x: 280, y: 0, width: 250, height: 340 },
                    isHero: false,
                    isOpener: false,
                  },
                ],
                contentHeightPx: 900,
                fillRatio: 0.79,
                columnMetrics: { leftFillRatio: 0.68, rightFillRatio: 0.79, deltaRatio: 0.11 },
                nodeIds: ['heading-1', 'paragraph-1'],
                documentIds: ['Front Matter'],
                openerDocumentId: null,
              },
            ],
            fragments: [],
            metrics: { fragmentCount: 3, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 2, pageCount: 2 },
          },
        },
        {
          title: 'Chapter 1',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [],
              contentHeightPx: 900,
              fillRatio: 1,
              columnMetrics: { leftFillRatio: 1, rightFillRatio: 1, deltaRatio: 0 },
              nodeIds: [],
              documentIds: ['Chapter 1'],
              openerDocumentId: 'Chapter 1',
            }],
            fragments: [],
            metrics: { fragmentCount: 0, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 0, pageCount: 1 },
          },
        },
      ],
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_MISSED_ART_OPPORTUNITY');
  });

  it('flags unused page regions when a sparse page still leaves a large bottom gap below existing art', () => {
    const review = reviewMeasuredExportLayout({
      documents: [
        {
          title: 'Chapter 1',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [],
              contentHeightPx: 900,
              fillRatio: 1,
              columnMetrics: { leftFillRatio: 1, rightFillRatio: 1, deltaRatio: 0 },
              nodeIds: [],
              documentIds: ['Chapter 1'],
              openerDocumentId: 'Chapter 1',
            }],
            fragments: [],
            metrics: { fragmentCount: 0, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 0, pageCount: 1 },
          },
        },
        {
          title: 'Chapter 2',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [
                {
                  nodeId: 'paragraph-2',
                  sourceIndex: 0,
                  presentationOrder: 0,
                  span: 'column',
                  placement: 'inline',
                  groupId: null,
                  keepTogether: false,
                  allowWrapBelow: false,
                  nodeType: 'paragraph',
                  content: { type: 'paragraph', content: [{ type: 'text', text: 'Closing scene text.' }] },
                  unitId: 'unit:paragraph-2',
                  pageIndex: 1,
                  columnIndex: 1,
                  region: 'column_left',
                  bounds: { x: 0, y: 0, width: 250, height: 120 },
                  isHero: false,
                  isOpener: false,
                },
                {
                  nodeId: 'art-1',
                  sourceIndex: 1,
                  presentationOrder: 1,
                  span: 'both_columns',
                  placement: 'bottom_panel',
                  groupId: null,
                  keepTogether: true,
                  allowWrapBelow: false,
                  nodeType: 'fullBleedImage',
                  content: { type: 'fullBleedImage', attrs: { src: '/uploads/repair.png', artRole: 'sparse_page_repair' } },
                  unitId: 'unit:art-1',
                  pageIndex: 1,
                  columnIndex: null,
                  region: 'full_width',
                  bounds: { x: 0, y: 220, width: 530, height: 220 },
                  isHero: false,
                  isOpener: false,
                },
              ],
              contentHeightPx: 900,
              fillRatio: 0.6,
              columnMetrics: { leftFillRatio: 0.6, rightFillRatio: 0.48, deltaRatio: 0.12 },
              nodeIds: ['paragraph-2', 'art-1'],
              documentIds: ['Chapter 2'],
              openerDocumentId: null,
            }],
            fragments: [],
            metrics: { fragmentCount: 2, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 1, pageCount: 1 },
          },
        },
        {
          title: 'Chapter 3',
          kind: 'chapter',
          pageModel: {
            preset: 'standard_pdf',
            flow: { preset: 'standard_pdf', sectionRecipe: 'chapter_hero_split', columnBalanceTarget: 'balanced', fragments: [], units: [] },
            pages: [{
              index: 1,
              preset: 'standard_pdf',
              recipe: 'chapter_hero_split',
              fragments: [],
              contentHeightPx: 900,
              fillRatio: 1,
              columnMetrics: { leftFillRatio: 1, rightFillRatio: 1, deltaRatio: 0 },
              nodeIds: [],
              documentIds: ['Chapter 3'],
              openerDocumentId: 'Chapter 3',
            }],
            fragments: [],
            metrics: { fragmentCount: 0, heroFragmentCount: 0, groupedFragmentCount: 0, keepTogetherCount: 0, pageCount: 1 },
          },
        },
      ],
    });

    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_UNUSED_PAGE_REGION');
    expect(review.findings.map((finding) => finding.code)).toContain('EXPORT_MISSED_ART_OPPORTUNITY');
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
