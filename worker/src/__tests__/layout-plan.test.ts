import { describe, expect, it } from 'vitest';
import {
  compileFlowModel,
  compileMeasuredPageModel,
  compilePageModel,
  recommendLayoutPlan,
  resolveLayoutPlan,
  renderContentWithLayoutPlan,
  renderFlowContentWithLayoutPlan,
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

  it('keeps hinted spot art in a single column instead of widening it to both columns', () => {
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
        paragraph('Opening body copy for the chapter.'),
        {
          type: 'fullBleedImage',
          attrs: {
            src: '/uploads/project/spot-art.png',
            caption: '',
            position: 'half',
            artRole: 'spot_art',
            layoutPlacementHint: 'side_panel',
            layoutSpanHint: 'column',
          },
        },
        paragraph('Follow-up body copy that should flow after the in-column art.'),
      ],
    };

    const pageModel = compilePageModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Into the Mine',
    });

    const spotFragment = pageModel.fragments.find((fragment) => (
      fragment.nodeType === 'fullBleedImage' && fragment.pageIndex === 1
    ));

    expect(spotFragment).toBeTruthy();
    expect(spotFragment?.span).toBe('column');
    expect(spotFragment?.placement).toBe('side_panel');
    expect(spotFragment?.region === 'column_left' || spotFragment?.region === 'column_right').toBe(true);
  });

  it('renders bottom-panel full-width art after the column flow in paged HTML', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('Closing scene text that should appear before the sparse-page repair art.'),
        paragraph('A second paragraph so the column flow is clearly populated before the bottom panel.'),
        {
          type: 'fullBleedImage',
          attrs: {
            src: '/uploads/project/sparse-repair.png',
            caption: '',
            position: 'full',
            artRole: 'sparse_page_repair',
            layoutPlacementHint: 'bottom_panel',
            layoutSpanHint: 'both_columns',
          },
        },
      ],
    };

    const html = renderContentWithLayoutPlan({
      content,
      preset: 'standard_pdf',
      options: {
        documentKind: 'chapter',
        documentTitle: 'Sparse Tail',
      },
    }).html;

    const columnsIndex = html.indexOf('layout-page__columns');
    const bottomPanelIndex = html.indexOf('layout-page__full-width layout-page__full-width--bottom');
    expect(columnsIndex).toBeGreaterThanOrEqual(0);
    expect(bottomPanelIndex).toBeGreaterThan(columnsIndex);
  });

  it('reserves extra bottom space for boxed utility blocks so they do not sit on the footer', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('A long appendix paragraph that should nearly fill the page without leaving enough room for the boxed callout below. '.repeat(18)),
        {
          type: 'sidebarCallout',
          attrs: { title: 'DM Tips' },
          content: [paragraph('A boxed utility block should be pushed to the next page instead of landing on the footer edge.')],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'back_matter',
      documentTitle: 'Appendix',
    });

    const paragraphUnit = flow.flow.units.find((unit) => unit.fragmentNodeIds.some((nodeId) =>
      flow.flow.fragments.find((fragment) => fragment.nodeId === nodeId)?.nodeType === 'paragraph',
    ));
    const calloutUnit = flow.flow.units.find((unit) => unit.fragmentNodeIds.some((nodeId) =>
      flow.flow.fragments.find((fragment) => fragment.nodeId === nodeId)?.nodeType === 'sidebarCallout',
    ));

    expect(paragraphUnit).toBeTruthy();
    expect(calloutUnit).toBeTruthy();

    const pageModel = compileMeasuredPageModel(flow.flow, [
      { unitId: paragraphUnit!.id, heightPx: 730 },
      { unitId: calloutUnit!.id, heightPx: 140 },
    ], {
      documentKind: 'back_matter',
      documentTitle: 'Appendix',
    });

    const calloutFragment = pageModel.fragments.find((fragment) => fragment.nodeType === 'sidebarCallout');
    expect(calloutFragment?.pageIndex).toBe(2);
  });

  it('relaxes overgrown encounter packets when footer collisions are reported', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Confronting the Ghostly Miner' }] },
        paragraph('An opening paragraph frames the confrontation.'),
        {
          type: 'readAloudBox',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'The ghost pleads for understanding in a wavering whisper.' }] }],
        },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph('Players can negotiate, threaten, or attack.')] }],
        },
        {
          type: 'statBlock',
          attrs: { name: 'Ghostly Miner', ac: 11, hp: 45, speed: '30 ft. (hover)' },
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'DM Tips' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Play up the tragedy and unease.' }] }],
        },
      ],
    };

    const recommended = recommendLayoutPlan(content, null, {
      documentKind: 'chapter',
      documentTitle: 'Confronting the Ghostly Miner',
      reviewCodes: ['EXPORT_FOOTER_COLLISION'],
    });

    expect(recommended.blocks.some((block) => block.groupId?.startsWith('encounter-packet'))).toBe(false);
    const statBlock = recommended.blocks.find((block) => block.nodeId.startsWith('statblock-'));
    expect(statBlock?.placement).toBe('side_panel');
    expect(statBlock?.keepTogether).toBe(true);
  });

  it('promotes the trailing front-matter utility tail into a bottom panel for intro spreads', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'DM Brief' }] },
        paragraph('Front-matter setup copy that fills the lead columns.'),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph('Opening summary.')] }],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Prep Checklist' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Mark the encounter tables you plan to use.')] },
            { type: 'listItem', content: [paragraph('Highlight one fail-forward clue per scene.')] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rewards and Scaling' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Use milestone advancement.')] },
            { type: 'listItem', content: [paragraph('Add reinforcements if the table is cruising.')] },
          ],
        },
      ],
    };

    const pageModel = compilePageModel(content, null, 'standard_pdf', {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    const checklistHeading = pageModel.fragments.find((fragment) =>
      fragment.nodeType === 'heading' && fragment.content.content?.[0]?.text === 'Prep Checklist',
    );
    const checklistList = pageModel.fragments.find((fragment) =>
      fragment.nodeType === 'bulletList' && fragment.presentationOrder === (checklistHeading?.presentationOrder ?? -1) + 1,
    );
    const rewardsHeading = pageModel.fragments.find((fragment) =>
      fragment.nodeType === 'heading' && fragment.content.content?.[0]?.text === 'Rewards and Scaling',
    );
    const rewardsList = pageModel.fragments.find((fragment) =>
      fragment.nodeType === 'bulletList' && fragment.presentationOrder === (rewardsHeading?.presentationOrder ?? -1) + 1,
    );

    expect(checklistHeading?.placement).toBe('bottom_panel');
    expect(checklistHeading?.span).toBe('both_columns');
    expect(checklistList?.placement).toBe('bottom_panel');
    expect(checklistList?.span).toBe('both_columns');
    expect(rewardsHeading?.placement).toBe('bottom_panel');
    expect(rewardsHeading?.span).toBe('both_columns');
    expect(rewardsList?.placement).toBe('bottom_panel');
    expect(rewardsList?.span).toBe('both_columns');

    const html = renderContentWithLayoutPlan({
      content,
      preset: 'standard_pdf',
      options: {
        documentKind: 'front_matter',
        documentTitle: 'Front Matter',
      },
    }).html;

    expect(html).toContain('layout-group-utility-grid');
    expect(html).toContain('layout-group-utility-grid--band');
  });

  it('treats a trailing front-matter sidebar callout as its own bottom-band utility panel', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'DM Brief' }] },
        paragraph('Front-matter setup copy that fills the lead columns.'),
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rewards and Scaling' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Use milestone advancement.')] },
            { type: 'listItem', content: [paragraph('Add reinforcements if the table is cruising.')] },
          ],
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'Prep Checklist' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mark the likely encounter table and highlight one fail-forward clue.' }] }],
        },
      ],
    };

    const pageModel = compilePageModel(content, null, 'standard_pdf', {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    const checklist = pageModel.fragments.find((fragment) =>
      fragment.nodeType === 'sidebarCallout' && fragment.content.attrs?.title === 'Prep Checklist',
    );
    expect(checklist?.placement).toBe('bottom_panel');
    expect(checklist?.span).toBe('both_columns');

    const html = renderContentWithLayoutPlan({
      content,
      preset: 'standard_pdf',
      options: {
        documentKind: 'front_matter',
        documentTitle: 'Front Matter',
      },
    }).html;

    expect(html).toContain('layout-group-utility-grid--band');
  });

  it('keeps oversized intro tail utility content inline instead of forcing it into a bottom band', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'titlePage',
          attrs: {
            title: 'Underdark Afterdark',
          },
        },
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'DM Brief' }] },
        paragraph('A stylish but dangerous descent into a city beneath the stone.'),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Track who remembers the missing hour and who denies it.')] },
            { type: 'listItem', content: [paragraph('Keep the party moving so the unstable clockwork district keeps changing underneath them.')] },
          ],
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Prep Checklist' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Prepare the opening clock-market scene, the stables, the painter, and the fountain so each clue can land on a different beat.')] },
            { type: 'listItem', content: [paragraph('Review how the Rhythm of the Prime Cog can be solved through song, movement, gear alignment, or brute-force improvisation when the table goes sideways.')] },
            { type: 'listItem', content: [paragraph('Keep one fail-forward clue ready for every room so the players can recover from bad rolls without stalling the mystery.')] },
          ],
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'Roleplaying the Amnesia' },
          content: [paragraph('Remind each player of one object or memory that should feel wrong, then make them decide whether to trust it while the city shifts beneath them.')],
        },
      ],
    };

    const resolved = resolveLayoutPlan(content, null, {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    const prepChecklistHeadingNodeId = String(resolved.content.content?.[4]?.attrs?.nodeId ?? '');
    const prepChecklistNode = resolved.layoutPlan.blocks.find((block) => block.nodeId === prepChecklistHeadingNodeId);
    const roleplayingNodeId = String(resolved.content.content?.[6]?.attrs?.nodeId ?? '');
    const roleplayingNode = resolved.layoutPlan.blocks.find((block) => block.nodeId === roleplayingNodeId);

    expect(prepChecklistNode?.placement).not.toBe('bottom_panel');
    expect(roleplayingNode?.placement).not.toBe('bottom_panel');
    expect(prepChecklistNode?.groupId ?? null).not.toBe('intro-tail-panel-1');
    expect(roleplayingNode?.groupId ?? null).not.toBe('intro-tail-panel-1');
  });

  it('groups only true encounter sections by local level-3 section instead of swallowing exploration openers', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'chapterHeader',
          attrs: {
            title: 'The Mine',
            chapterNumber: 'Chapter 2',
            backgroundImage: '/uploads/project/chapter-two.png',
          },
        },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chapter 2: The Mine' }] },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Exploring the Mine' }] },
        paragraph('The party enters the mine and begins to hear the first whispers.'),
        {
          type: 'fullBleedImage',
          attrs: {
            src: '/uploads/project/mine-spot.png',
            caption: '',
            position: 'half',
            artRole: 'spot_art',
            layoutPlacementHint: 'side_panel',
            layoutSpanHint: 'column',
          },
        },
        {
          type: 'readAloudBox',
          content: [paragraph('The entrance gapes like a mouth beneath the hill.')],
        },
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Confronting the Ghostly Miner' }] },
        paragraph('The ghostly miner emerges from the tunnel wall.'),
        {
          type: 'statBlock',
          attrs: { name: 'Ghostly Miner', ac: 11, hp: 45, speed: 'fly 30 ft. (hover)' },
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'DM Tips', calloutType: 'info' },
          content: [paragraph('Play up the pity and menace in equal measure.')],
        },
      ],
    };

    const pageModel = compilePageModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    const groupIds = new Set(
      pageModel.fragments
        .map((fragment) => fragment.groupId)
        .filter((groupId): groupId is string => Boolean(groupId && groupId.startsWith('encounter-packet-'))),
    );

    expect(groupIds.size).toBe(1);
    const exploringImage = pageModel.fragments.find((fragment) => fragment.nodeType === 'fullBleedImage');
    const minerStats = pageModel.fragments.find((fragment) => fragment.nodeType === 'statBlock');
    expect(exploringImage?.groupId).not.toBe(minerStats?.groupId);
    expect(exploringImage?.groupId ?? null).toBeNull();
  });

  it('anchors encounter packets around the actual stat block instead of swallowing earlier scene tables', () => {
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
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Exploring the Blackglass Mine' }] },
        paragraph('The first stretch of the mine is exploration-heavy and should stay flexible.'),
        {
          type: 'randomTable',
          attrs: {
            title: 'Mine Echoes',
            dieType: 'd6',
            entries: JSON.stringify([{ roll: '1', result: 'A chill passes through the lantern flame.' }]),
          },
        },
        {
          type: 'fullBleedImage',
          attrs: {
            src: '/uploads/project/torchbearer.png',
            caption: '',
            position: 'half',
            artRole: 'spot_art',
            layoutPlacementHint: 'side_panel',
            layoutSpanHint: 'column',
          },
        },
        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Confronting the Ghostly Miner' }] },
        paragraph('The ghostly miner rises from the rock with a rusted pick in hand.'),
        {
          type: 'readAloudBox',
          content: [paragraph('Help me, the spirit croaks from the stone.')],
        },
        {
          type: 'statBlock',
          attrs: { name: 'Ghostly Miner', ac: 11, hp: 45, speed: 'fly 30 ft. (hover)' },
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'DM Tips', calloutType: 'info' },
          content: [paragraph('Play up pity first, then menace.')],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    const randomTableFragment = flow.flow.fragments.find((fragment) => fragment.nodeType === 'randomTable');
    const statBlockFragment = flow.flow.fragments.find((fragment) => fragment.nodeType === 'statBlock');
    const readAloudFragment = flow.flow.fragments.find((fragment) => fragment.nodeType === 'readAloudBox');

    expect(randomTableFragment?.groupId ?? null).toBeNull();
    expect(statBlockFragment?.groupId).toBeTruthy();
    expect(readAloudFragment?.groupId).toBe(statBlockFragment?.groupId);
  });

  it('drops stale oversized encounter-packet groupings from persisted layout plans', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3, nodeId: 'h1' }, content: [{ type: 'text', text: 'Exploring the Mine' }] },
        { type: 'paragraph', attrs: { nodeId: 'p1' }, content: [{ type: 'text', text: 'Exploration copy.' }] },
        {
          type: 'randomTable',
          attrs: {
            nodeId: 'rt1',
            title: 'Mine Echoes',
            dieType: 'd6',
            entries: JSON.stringify([{ roll: '1', result: 'Cold wind.' }]),
          },
        },
        { type: 'heading', attrs: { level: 4, nodeId: 'h2' }, content: [{ type: 'text', text: 'Confronting the Ghostly Miner' }] },
        { type: 'paragraph', attrs: { nodeId: 'p2' }, content: [{ type: 'text', text: 'The ghost rises from the rock.' }] },
        { type: 'readAloudBox', attrs: { nodeId: 'ra1' }, content: [paragraph('A rasping plea echoes in the dark.')] },
        { type: 'statBlock', attrs: { nodeId: 'sb1', name: 'Ghostly Miner', ac: 11, hp: 45 } },
        { type: 'sidebarCallout', attrs: { nodeId: 'sc1', title: 'DM Tips' }, content: [paragraph('Play up the pity first.')] },
      ],
    };

    const resolved = resolveLayoutPlan(content, {
      version: 1,
      sectionRecipe: 'chapter_hero_split',
      columnBalanceTarget: 'balanced',
      blocks: ['h1', 'p1', 'rt1', 'h2', 'p2', 'ra1', 'sb1', 'sc1'].map((nodeId, index) => ({
        nodeId,
        presentationOrder: index,
        span: 'column' as const,
        placement: nodeId === 'sb1' ? 'side_panel' as const : 'inline' as const,
        groupId: 'encounter-packet-1',
        keepTogether: true,
        allowWrapBelow: false,
      })),
    }, {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    const randomTablePlan = resolved.layoutPlan.blocks.find((block) => block.nodeId === 'rt1');
    const statBlockPlan = resolved.layoutPlan.blocks.find((block) => block.nodeId === 'sb1');
    expect(randomTablePlan?.groupId ?? null).not.toBe('encounter-packet-1');
    expect(statBlockPlan?.groupId).toBeTruthy();
  });

  it('re-groups showcase utility blocks with their section intro so short pages do not checkerboard', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, nodeId: 'h1' }, content: [{ type: 'text', text: 'A Souvenir of a Dead Future' }] },
        paragraph('As the party gathers their gear from the scorched workshop, they uncover a relic from the timeline that never was.'),
        {
          type: 'magicItem',
          attrs: {
            nodeId: 'mi1',
            name: 'Echo of the Unwritten Age',
            type: 'Wondrous Item',
            rarity: 'Rare',
            description: 'This brass pocket watch hums a second before danger strikes and remembers futures that never survived.',
          },
        },
        { type: 'heading', attrs: { level: 2, nodeId: 'h2' }, content: [{ type: 'text', text: "The Inventor's Legacy" }] },
        paragraph('Whether Master Geargrind was consumed by the core or cast into another branch of reality, no sign of him remains.'),
      ],
    };

    const resolved = resolveLayoutPlan(content, null, {
      documentKind: 'chapter',
      documentTitle: 'The Missing Hour',
    });

    const headingPlan = resolved.layoutPlan.blocks.find((block) => block.nodeId === 'h1');
    const introParagraphPlan = resolved.layoutPlan.blocks.find((block) =>
      block.nodeId === String(resolved.content.content?.[1]?.attrs?.nodeId),
    );
    const magicItemPlan = resolved.layoutPlan.blocks.find((block) => block.nodeId === 'mi1');

    expect(headingPlan?.groupId).toBeTruthy();
    expect(headingPlan?.groupId).toBe(magicItemPlan?.groupId);
    expect(introParagraphPlan?.groupId).toBe(magicItemPlan?.groupId);
    expect(magicItemPlan?.groupId?.startsWith('utility-table-')).toBe(true);
    expect(magicItemPlan?.placement).toBe('side_panel');

    const html = renderContentWithLayoutPlan({
      content,
      layoutPlan: resolved.layoutPlan,
      preset: 'standard_pdf',
      options: {
        documentKind: 'chapter',
        documentTitle: 'The Missing Hour',
      },
    }).html;

    expect(html).toContain('layout-group-packet');
    expect(html).toContain('layout-node-magicItem');
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
      heightPx: index === 0 ? 260 : 700,
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

  it('gives a front-matter table of contents a dedicated full page when DM brief content follows', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'titlePage',
          attrs: {
            title: 'The Blackglass Mine',
          },
        },
        {
          type: 'tableOfContents',
          attrs: {
            title: 'Table of Contents',
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
      ],
    };

    const resolved = resolveLayoutPlan(content, null, {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });
    const tocNodeId = String(resolved.content.content?.[1]?.attrs?.nodeId ?? '');
    const tocPlan = resolved.layoutPlan?.blocks.find((block) => block.nodeId === tocNodeId);

    expect(tocPlan).toMatchObject({
      span: 'full_page',
      placement: 'full_page_insert',
      keepTogether: true,
    });

    const pageModel = compilePageModel(resolved.content, resolved.layoutPlan, 'standard_pdf', {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    expect(pageModel.pages.length).toBeGreaterThanOrEqual(3);
    expect(pageModel.pages[1]?.fragments.some((fragment) => fragment.nodeId === tocNodeId && fragment.region === 'full_page')).toBe(true);
  });

  it('attaches short label paragraphs to the following list so they do not orphan at page bottoms', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('Setup copy for the scene.'),
        {
          type: 'paragraph',
          content: [{
            type: 'text',
            text: 'Player Options:',
            marks: [{ type: 'bold' }],
          }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Push further into the mine.')] },
            { type: 'listItem', content: [paragraph('Return to town for help.')] },
          ],
        },
      ],
    };

    const resolved = resolveLayoutPlan(content, null, {
      documentKind: 'chapter',
      documentTitle: 'The Village',
    });

    const labelNodeId = String(resolved.content.content?.[1]?.attrs?.nodeId ?? '');
    const listNodeId = String(resolved.content.content?.[2]?.attrs?.nodeId ?? '');
    const labelPlan = resolved.layoutPlan?.blocks.find((block) => block.nodeId === labelNodeId);
    const listPlan = resolved.layoutPlan?.blocks.find((block) => block.nodeId === listNodeId);

    expect(labelPlan?.groupId).toBeTruthy();
    expect(labelPlan?.groupId).toBe(listPlan?.groupId);
    expect(labelPlan?.keepTogether).toBe(true);
    expect(listPlan?.keepTogether).toBe(true);
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

  it('attaches a short terminal paragraph to the preceding support block to avoid orphan tail pages', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'sidebarCallout',
          attrs: { title: 'Consequences', calloutType: 'info' },
          content: [paragraph('If the party breaks the ward, the tunnels awaken around them.')],
        },
        paragraph('One last omen lingers in the dust.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Consequences',
    });

    const groupIds = flow.flow.fragments.map((fragment) => fragment.groupId).filter(Boolean);
    expect(groupIds.every((groupId) => groupId === 'tail-packet-1' || groupId === 'terminal-tail-packet-1')).toBe(true);
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

    const pageModel = compileMeasuredPageModel(flow.flow, flow.flow.units.map((unit, index) => ({
      unitId: unit.id,
      heightPx: index === 0 ? 260 : 180,
    })), {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });
    expect(pageModel.fragments.find((fragment) => fragment.nodeType === 'randomTable')?.columnIndex).not.toBeNull();
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
            entries: JSON.stringify(Array.from({ length: 10 }, (_, index) => ({
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

  it('keeps grouped utility packets full-width when the random table anchor is both-column', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Artifact Interactions' }],
        },
        {
          type: 'randomTable',
          attrs: {
            title: 'Artifact Interactions',
            dieType: 'd10',
            entries: JSON.stringify(Array.from({ length: 10 }, (_, index) => ({
              roll: String(index + 1),
              result: `Entry ${index + 1} describes a threat, choice, and reward in enough detail to need width.`,
            }))),
          },
        },
        paragraph('Use the results to shape the fallout that follows the artifact scene.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    const utilityUnit = flow.flow.units.find((unit) => unit.groupId?.startsWith('utility-table'));
    expect(utilityUnit?.span).toBe('both_columns');

    const pageModel = compileMeasuredPageModel(flow.flow, flow.flow.units.map((unit) => ({
      unitId: unit.id,
      heightPx: unit.id === utilityUnit?.id ? 320 : 140,
    })), {
      documentKind: 'chapter',
      documentTitle: 'Chapter 2: The Mine',
    });

    expect(pageModel.fragments.find((fragment) => fragment.nodeType === 'randomTable')?.region).toBe('full_width');
    expect(pageModel.fragments.find((fragment) => fragment.nodeType === 'randomTable')?.columnIndex).toBeNull();
  });

  it('marks grouped full-width utility bands as full-width in flow html so measurement matches paged output', () => {
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
        paragraph('Front-matter setup copy that fills the lead columns.'),
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rewards and Scaling' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Use milestone advancement.')] },
            { type: 'listItem', content: [paragraph('Add reinforcements if the table is cruising.')] },
          ],
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'Prep Checklist' },
          content: [paragraph('Highlight the likely encounter table and one fail-forward clue.')],
        },
      ],
    };

    const rendered = renderFlowContentWithLayoutPlan({
      content,
      preset: 'editor_preview',
      options: {
        documentKind: 'front_matter',
        documentTitle: 'Front Matter',
      },
    });

    expect(rendered.html).toContain('layout-group-utility-grid--band layout-span-both_columns layout-placement-bottom_panel');
    expect(rendered.html).toContain('data-layout-span="both_columns"');
    expect(rendered.html).toContain('data-layout-placement="bottom_panel"');
  });

  it('attaches a very short trailing paragraph to the section it closes', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'npcProfile',
          attrs: { name: 'Mayor Aldric', role: 'Mayor' },
        },
        paragraph('The rumors and suspicions provide a tantalizing glimpse into the haunted history surrounding the mine and shift the players toward deeper investigation.'),
        paragraph('With these insights gained, they press on toward the mine.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Chapter 1: The Town',
    });

    const narrativeParagraphs = flow.flow.fragments.filter((fragment) => fragment.nodeType === 'paragraph');
    expect(narrativeParagraphs).toHaveLength(2);
    expect(narrativeParagraphs[0]?.groupId).toBeTruthy();
    expect(narrativeParagraphs[1]?.groupId).toBe(narrativeParagraphs[0]?.groupId);
  });

  it('treats manual page breaks as hard measured boundaries and omits break blocks from paged HTML', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('The opening scene ends here.'),
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'A Fresh Page Begins' }],
        },
        paragraph('The next section should begin on a new page without rendering a pageBreak block.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Fresh Page',
    });
    const measurements = flow.flow.units.map((unit) => {
      const isPageBreakUnit = unit.fragmentNodeIds.some((nodeId) => (
        flow.flow.fragments.find((fragment) => fragment.nodeId === nodeId)?.nodeType === 'pageBreak'
      ));

      return {
        unitId: unit.id,
        heightPx: isPageBreakUnit ? 1 : 140,
      };
    });
    const pageModel = compileMeasuredPageModel(flow.flow, measurements, {
      documentKind: 'chapter',
      documentTitle: 'Fresh Page',
      respectManualPageBreaks: true,
    });
    const html = renderContentWithLayoutPlan({
      content,
      pageModel,
      preset: 'standard_pdf',
      options: {
        documentKind: 'chapter',
        documentTitle: 'Fresh Page',
      },
    }).html;

    expect(pageModel.pages).toHaveLength(2);
    expect(pageModel.pages[0]).toMatchObject({
      boundaryType: 'pageBreak',
      boundarySourceIndex: 1,
    });
    expect(pageModel.fragments.some((fragment) => fragment.nodeType === 'pageBreak')).toBe(false);
    expect(html).not.toContain('data-node-type="pageBreak"');
    expect(html).not.toContain('class="page-break"');
  });
});
