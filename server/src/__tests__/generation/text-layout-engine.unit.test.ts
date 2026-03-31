import { describe, expect, it } from 'vitest';
import {
  buildFlowTextLayoutShadowTelemetry,
  buildPageMetricsSnapshotFromPageModel,
  compileFlowModel,
  compileMeasuredPageModel,
  measureFlowTextUnits,
  parseTextLayoutEngineMode,
  type DocumentContent,
} from '@dnd-booker/shared';
import { ensureNodeCanvasMeasurementBackend } from '@dnd-booker/text-layout/node';

function paragraph(text: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

describe('shared text layout engine integration', () => {
  it('defaults unknown engine modes to legacy', () => {
    expect(parseTextLayoutEngineMode(undefined)).toBe('legacy');
    expect(parseTextLayoutEngineMode(null)).toBe('legacy');
    expect(parseTextLayoutEngineMode('unexpected')).toBe('legacy');
    expect(parseTextLayoutEngineMode('shadow')).toBe('shadow');
    expect(parseTextLayoutEngineMode('pretext')).toBe('pretext');
  });

  it('measures supported flow units through the shared text layout service', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'A Measured Heading' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'This paragraph should be measured by the text layout engine rather than the legacy character-count heuristic.' }],
        },
        {
          type: 'readAloudBox',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Speak this boxed text aloud to the party when they enter the ruined watchtower.' }],
            },
          ],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'editor_preview', {});
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
    });

    expect(result.measurements).toHaveLength(flow.flow.units.length);
    expect(result.telemetry.supportedUnitCount).toBeGreaterThanOrEqual(1);
    expect(result.telemetry.unsupportedUnitCount).toBeLessThan(flow.flow.units.length);
    expect(result.measurements.every((measurement) => measurement.heightPx > 0)).toBe(true);
  });

  it('measures table of contents entries as supported text surfaces', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'tableOfContents', attrs: { title: 'Adventure Contents' } },
        { type: 'chapterHeader', attrs: { chapterNumber: '1', title: 'Into the Mire' } },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'The Rotfen Causeway' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Ambush in the Reeds' }],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'editor_preview', {});
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
    });

    expect(result.telemetry.unsupportedUnitCount).toBe(0);
    expect(result.surfaces.some((surface) => surface.kind === 'toc_entry')).toBe(true);
  });

  it('measures npc roster groups without falling back to legacy estimates', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'npcProfile',
          attrs: { name: 'Eldira Voss', role: 'Tavern Keeper', description: 'Keeps one eye on every rumor in town.' },
        },
        {
          type: 'npcProfile',
          attrs: { name: 'Harold Bexley', role: 'Blacksmith', description: 'Shapes cold iron and colder opinions.' },
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Townsfolk',
    });
    const rosterUnit = flow.flow.units.find((unit) => unit.groupId?.startsWith('npc-roster'));
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Townsfolk',
    });

    expect(rosterUnit).toBeTruthy();
    expect(result.unsupportedUnitIds).not.toContain(rosterUnit!.id);
  });

  it('measures encounter packet groups without falling back to legacy estimates', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
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
            { type: 'listItem', content: [paragraph('Tactics: strike once, then phase away into the stone.')] },
            { type: 'listItem', content: [paragraph('Reward: the wall scratches hint at the ritual chamber below.')] },
          ],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Shadow Encounter',
    });
    const packetUnit = flow.flow.units.find((unit) => unit.groupId?.startsWith('encounter-packet'));
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Shadow Encounter',
    });

    expect(packetUnit).toBeTruthy();
    expect(result.unsupportedUnitIds).not.toContain(packetUnit!.id);
  });

  it('measures utility packet and intro-tail groups without falling back to legacy estimates', () => {
    ensureNodeCanvasMeasurementBackend();

    const utilityContent: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Chilling Discoveries' }],
        },
        {
          type: 'randomTable',
          attrs: {
            title: 'Chilling Discoveries',
            dieType: 'd10',
            entries: JSON.stringify([
              { roll: '1', result: 'A cold draft carries distant chanting.' },
              { roll: '2', result: 'Loose stones reveal an old miner badge.' },
            ]),
          },
        },
        paragraph('Use the table whenever the party lingers in the dark too long.'),
      ],
    };

    const utilityFlow = compileFlowModel(utilityContent, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Discoveries',
    });
    const utilityUnit = utilityFlow.flow.units.find((unit) => unit.groupId?.startsWith('utility-table'));
    const utilityResult = measureFlowTextUnits(utilityFlow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Discoveries',
    });

    expect(utilityUnit).toBeTruthy();
    expect(utilityResult.unsupportedUnitIds).not.toContain(utilityUnit!.id);

    const introTailContent: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'DM Brief' }],
        },
        paragraph('Front-matter setup copy that fills the lead columns.'),
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Prep Checklist' }],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [paragraph('Mark the encounter tables you plan to use.')] },
            { type: 'listItem', content: [paragraph('Highlight one fail-forward clue per scene.')] },
          ],
        },
        {
          type: 'sidebarCallout',
          attrs: { title: 'Rewards and Scaling' },
          content: [paragraph('Use milestone advancement and add reinforcements if the table is cruising.')],
        },
      ],
    };

    const introTailFlow = compileFlowModel(introTailContent, null, 'standard_pdf', {
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });
    const introTailUnit = introTailFlow.flow.units.find((unit) => unit.groupId?.startsWith('intro-tail-panel'));
    const introTailResult = measureFlowTextUnits(introTailFlow.flow, {
      theme: 'gilded-folio',
      documentKind: 'front_matter',
      documentTitle: 'Front Matter',
    });

    expect(introTailUnit).toBeTruthy();
    expect(introTailResult.unsupportedUnitIds).not.toContain(introTailUnit!.id);
  });

  it('measures stacked keep-together groups without falling back to legacy estimates', () => {
    ensureNodeCanvasMeasurementBackend();

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

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Options',
    });
    const stackedUnit = flow.flow.units.find((unit) => unit.groupId?.startsWith('lead-label-packet'));
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Options',
    });

    expect(stackedUnit).toBeTruthy();
    expect(result.unsupportedUnitIds).not.toContain(stackedUnit!.id);
  });

  it('keeps grouped map-based utility packets on explicit legacy fallback', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Mine Approaches' }],
        },
        {
          type: 'mapBlock',
          attrs: {
            src: '/maps/mine-approaches.png',
            scale: '1 inch = 5 feet',
            keyEntries: JSON.stringify([{ label: 'A', description: 'Collapsed entrance.' }]),
          },
        },
        paragraph('Use the map to orient the party before the first descent.'),
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'Mine Approaches',
    });
    const mapGroupUnit = flow.flow.units.find((unit) => unit.fragmentNodeIds.some((nodeId) => (
      flow.flow.fragments.find((fragment) => fragment.nodeId === nodeId)?.nodeType === 'mapBlock'
    )));
    const result = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Mine Approaches',
    });

    expect(mapGroupUnit?.groupId).toBeTruthy();
    expect(result.unsupportedUnitIds).toContain(mapGroupUnit!.id);
  });

  it('builds AI page metrics snapshots from measured page models', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'The Blackglass Mine' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'A trail of soot-black glass leads from the village well into the hills.' }],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'editor_preview', {});
    const measurementResult = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
    });
    const pageModel = compileMeasuredPageModel(flow.flow, measurementResult.measurements, {});
    const snapshot = buildPageMetricsSnapshotFromPageModel(pageModel);

    expect(snapshot.totalPages).toBe(1);
    expect(snapshot.pages[0]?.nodeIndices).toEqual([0, 1]);
    expect(snapshot.nodes?.[0]).toEqual(expect.objectContaining({
      nodeType: 'heading',
      page: 1,
    }));
  });

  it('synthesizes manual page-break nodes from measured page boundaries', () => {
    ensureNodeCanvasMeasurementBackend();

    const content: DocumentContent = {
      type: 'doc',
      content: [
        paragraph('The opening scene ends here.'),
        { type: 'pageBreak' },
        { type: 'pageBreak' },
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'The Descent Begins' }],
        },
      ],
    };

    const flow = compileFlowModel(content, null, 'standard_pdf', {
      documentKind: 'chapter',
      documentTitle: 'The Descent Begins',
    });
    const measurementResult = measureFlowTextUnits(flow.flow, {
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'The Descent Begins',
    });
    const pageModel = compileMeasuredPageModel(flow.flow, measurementResult.measurements, {
      documentKind: 'chapter',
      documentTitle: 'The Descent Begins',
      respectManualPageBreaks: true,
    });
    const snapshot = buildPageMetricsSnapshotFromPageModel(pageModel);

    expect(pageModel.pages).toHaveLength(3);
    expect(pageModel.fragments.some((fragment) => fragment.nodeType === 'pageBreak')).toBe(false);
    expect(pageModel.pages[0]).toMatchObject({
      boundaryType: 'pageBreak',
      boundarySourceIndex: 1,
    });
    expect(pageModel.pages[1]).toMatchObject({
      boundaryType: 'pageBreak',
      boundarySourceIndex: 2,
    });
    expect(snapshot.pages[0]?.nodeTypes).toContain('pageBreak');
    expect(snapshot.pages[1]?.isBlank).toBe(true);
    expect(snapshot.nodes?.filter((node) => node.nodeType === 'pageBreak').map((node) => node.nodeIndex)).toEqual([1, 2]);
    expect(snapshot.findings?.some((finding) => finding.code === 'consecutive_page_breaks')).toBe(true);
  });

  it('builds consistent shadow telemetry payloads', () => {
    const telemetry = buildFlowTextLayoutShadowTelemetry({
      legacyMeasurements: [{ unitId: 'u1', heightPx: 100 }, { unitId: 'u2', heightPx: 220 }],
      engineMeasurements: [{ unitId: 'u1', heightPx: 112 }, { unitId: 'u2', heightPx: 180 }],
      engineTelemetry: {
        surfaceCount: 4,
        supportedSurfaceCount: 4,
        unsupportedSurfaceCount: 0,
        supportedUnitCount: 2,
        unsupportedUnitCount: 0,
      },
      legacyPageCount: 3,
      pretextPageCount: 2,
    });

    expect(telemetry.totalHeightDeltaPx).toBe(52);
    expect(telemetry.pageCountDelta).toBe(-1);
    expect(telemetry.supportedUnitCount).toBe(2);
  });
});
