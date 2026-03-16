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

  it('allows intro front matter to use a two-column spread after the title page', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'titlePage',
          attrs: {
            title: 'The Blackglass Mine',
          },
        },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'DM Brief' }] },
        paragraph('A compact one-shot for 4-5 characters exploring a cursed mine outside a frightened frontier village.'),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Run time: 3-4 hours.')] },
            { type: 'listItem', content: [paragraph('Tone: eerie frontier mystery.')] },
            { type: 'listItem', content: [paragraph('Primary threat: spectral miners and living stone.')] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Prep Checklist' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Review the village NPCs and what each one knows.')] },
            { type: 'listItem', content: [paragraph('Sketch the three key mine approaches and likely clues.')] },
            { type: 'listItem', content: [paragraph('Prepare the final ritual chamber and the Gravel Guardian reveal.')] },
          ],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });
    const measurements = flow.flow.units.map((unit, index) => ({
      unitId: unit.id,
      heightPx: index === 0 ? 760 : index === 1 ? 52 : index === 2 ? 240 : index === 3 ? 220 : index === 4 ? 52 : 180,
    }));
    const pageModel = compileMeasuredPageModel(flow.flow, measurements, {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    expect(pageModel.pages.length).toBe(2);
    expect(pageModel.pages[1]?.fragments.some((fragment) => fragment.region === 'column_right')).toBe(true);
  });

  it('keeps grouped encounter packets on the current page when they fit below existing content', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('The route into the mine is lined with abandoned tools, cold ash, and old prayer markers that set the mood before the ambush begins.'),
        paragraph('The phantoms have the following stats:'),
        {
          type: 'statBlock',
          attrs: {
            name: 'Phantom Apparition',
            ac: 13,
            hp: 10,
            speed: 'fly 40 ft. (hover)',
          },
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Tactics: the phantoms phase away after landing one frightening strike.')] },
            { type: 'listItem', content: [paragraph('Reward: clues etched into the mine wall point toward the ritual chamber.')] },
          ],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Into the Blackglass Mine',
    });
    const measurements = flow.flow.units.map((unit, index) => ({
      unitId: unit.id,
      heightPx: index === 0 ? 420 : 220,
    }));
    const pageModel = compileMeasuredPageModel(flow.flow, measurements, {
      documentKind: 'chapter',
      documentTitle: 'Into the Blackglass Mine',
    });

    expect(pageModel.pages).toHaveLength(1);
    expect(pageModel.pages[0]?.fragments.some((fragment) => fragment.groupId === 'encounter-packet-1')).toBe(true);
  });

  it('groups local utility packets around random tables in chapter hero layouts', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'chapterHeader',
          attrs: {
            title: 'The Mine',
            chapterNumber: 'Chapter 2',
          },
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chilling Discoveries' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Roll when the players probe strange side passages.')] },
          ],
        },
        {
          type: 'randomTable',
          attrs: {
            title: 'Chilling Discoveries',
            dieType: 'd10',
            entries: JSON.stringify([
              { roll: '1', result: 'A cold draft carries distant chanting.' },
              { roll: '2', result: 'Loose stones reveal an old miner’s badge.' },
            ]),
          },
        },
        paragraph('Players can roll when they pause to investigate the tunnels.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    const utilityGroupIds = new Set(
      flow.flow.fragments
        .filter((fragment) => fragment.groupId?.startsWith('utility-table'))
        .map((fragment) => fragment.groupId),
    );

    expect(utilityGroupIds.size).toBe(1);
    expect(flow.flow.fragments.find((fragment) => fragment.nodeType === 'randomTable')?.placement).toBe('side_panel');
  });

  it('promotes large random tables to both-column layout blocks', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'randomTable',
          attrs: {
            title: 'Mine Encounters',
            dieType: 'd10',
            entries: JSON.stringify(Array.from({ length: 8 }, (_, index) => ({
              roll: String(index + 1),
              result: `Encounter ${index + 1}`,
            }))),
          },
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Mine Encounters',
    });

    expect(flow.flow.fragments.find((fragment) => fragment.nodeType === 'randomTable')?.span).toBe('both_columns');
  });
});
