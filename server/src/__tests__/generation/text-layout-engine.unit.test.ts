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
