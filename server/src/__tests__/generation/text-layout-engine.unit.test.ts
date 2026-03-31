import { describe, expect, it } from 'vitest';
import {
  compileFlowModel,
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
});
