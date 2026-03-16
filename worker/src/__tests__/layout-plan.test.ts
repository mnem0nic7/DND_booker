import { describe, expect, it } from 'vitest';
import {
  compileFlowModel,
  compileMeasuredPageModel,
  compilePageModel,
  renderContentWithLayoutPlan,
  validateLayoutPlan,
  type DocumentContent,
} from '@dnd-booker/shared';

function paragraph(text: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

describe('layout-plan', () => {
  it('rejects invalid layout plan recipes, duplicate orders, and missing node references', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [paragraph('Hello world')],
    };

    const result = validateLayoutPlan(content, {
      version: 1,
      sectionRecipe: 'unknown_recipe' as any,
      columnBalanceTarget: 'balanced',
      blocks: [
        {
          nodeId: 'missing-node',
          presentationOrder: 0,
          span: 'column',
          placement: 'inline',
          groupId: null,
          keepTogether: false,
          allowWrapBelow: false,
        },
        {
          nodeId: 'another-missing-node',
          presentationOrder: 0,
          span: 'column',
          placement: 'inline',
          groupId: null,
          keepTogether: false,
          allowWrapBelow: false,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Unknown sectionRecipe');
    expect(result.errors.join(' ')).toContain('Duplicate presentationOrder 0');
    expect(result.errors.join(' ')).toContain('missing nodeId');
  });

  it('promotes a chapter hero block to full-width hero placement and flows content below', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('Opening scene copy.'),
        {
          type: 'chapterHeader',
          attrs: {
            title: 'Into the Mine',
            chapterNumber: 'Chapter 2',
            backgroundImage: '/uploads/project/chapter-two.png',
          },
        },
        paragraph('Follow-up body copy.'),
      ],
    };

    const pageModel = compilePageModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Into the Mine',
    });

    expect(pageModel.pages[0]?.recipe).toBe('chapter_hero_split');
    expect(pageModel.fragments[0]?.nodeType).toBe('chapterHeader');
    expect(pageModel.fragments[0]?.span).toBe('both_columns');
    expect(pageModel.fragments[0]?.placement).toBe('hero_top');
    expect(pageModel.fragments[1]?.nodeType).toBe('paragraph');
  });

  it('renders grouped npc grids and encounter packets into canonical layout HTML', () => {
    const npcContent: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'npcProfile',
          attrs: { name: 'Eldira Voss', role: 'Tavern Keeper' },
        },
        {
          type: 'npcProfile',
          attrs: { name: 'Harold Bexley', role: 'Blacksmith' },
        },
      ],
    };

    const npcHtml = renderContentWithLayoutPlan({
      content: npcContent,
      preset: 'editor_preview',
      options: {
        documentKind: 'chapter',
        documentTitle: 'Meeting the Townsfolk',
      },
    }).html;

    expect(npcHtml).toContain('layout-group-npc-grid');

    const encounterContent: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('The phantoms have the following stats:'),
        {
          type: 'statBlock',
          attrs: { name: 'Phantom Apparition', ac: 13, hp: 10, speed: '0 ft., fly 40 ft. (hover)' },
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Tactics and rewards.')] },
          ],
        },
      ],
    };

    const encounterHtml = renderContentWithLayoutPlan({
      content: encounterContent,
      preset: 'standard_pdf',
      options: {
        documentKind: 'chapter',
        documentTitle: 'Shadow Encounter',
      },
    }).html;

    expect(encounterHtml).toContain('layout-group-packet');
    expect(encounterHtml).toContain('data-node-type="statBlock"');
  });

  it('builds a measured multi-page model with a hero opener and balanced body flow', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'chapterHeader',
          attrs: {
            title: 'Into the Mine',
            chapterNumber: 'Chapter 2',
            backgroundImage: '/uploads/project/chapter-two.png',
          },
        },
        paragraph('Opening body copy.'),
        paragraph('Exploration details.'),
        paragraph('Encounter setup.'),
        paragraph('More scene support.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Into the Mine',
    });
    const measurements = flow.flow.units.map((unit, index) => ({
      unitId: unit.id,
      heightPx: index === 0 ? 260 : 520,
    }));
    const pageModel = compileMeasuredPageModel(flow.flow, [
      ...measurements,
    ], {
      documentKind: 'chapter',
      documentTitle: 'Into the Mine',
    });

    expect(pageModel.pages.length).toBeGreaterThan(1);
    expect(pageModel.pages[0]?.fragments.some((fragment) => fragment.region === 'hero')).toBe(true);
    expect(pageModel.pages[0]?.columnMetrics.leftFillRatio).not.toBeNull();
  });
});
