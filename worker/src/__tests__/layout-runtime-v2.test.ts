import { describe, expect, it } from 'vitest';
import {
  buildLayoutDocumentV2,
  layoutDocumentV2ToPageModel,
  type DocumentContent,
} from '@dnd-booker/shared';

function text(value: string): DocumentContent {
  return { type: 'text', text: value };
}

function paragraph(value: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [text(value)],
  };
}

function heading(level: number, value: string): DocumentContent {
  return {
    type: 'heading',
    attrs: { level },
    content: [text(value)],
  };
}

describe('LayoutRuntimeV2', () => {
  it('builds a deterministic snapshot and reconstructs the page model', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        heading(1, 'Underdark Afterdark'),
        paragraph('A lantern-lit descent begins beneath the city where forgotten clocks still tick.'),
        {
          type: 'sidebarCallout',
          attrs: {
            title: 'DM Tip: Slow the Reveal',
            calloutType: 'tip',
          },
          content: [
            paragraph('Let the first clues feel mundane before the temporal damage becomes obvious.'),
          ],
        },
        paragraph('The first chamber still smells like wet brass and ozone despite the decades of dust.'),
      ],
    };

    const snapshot = buildLayoutDocumentV2({
      content,
      preset: 'standard_pdf',
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Underdark Afterdark',
      measurementMode: 'deterministic',
      respectManualPageBreaks: true,
    });

    expect(snapshot.version).toBe(2);
    expect(snapshot.pages.length).toBeGreaterThan(0);
    expect(snapshot.fragments.length).toBeGreaterThan(0);
    expect(snapshot.anchors.length).toBeGreaterThan(0);
    expect(snapshot.measureProfile.preset).toBe('standard_pdf');

    const pageModel = layoutDocumentV2ToPageModel(snapshot);
    expect(pageModel.pages.length).toBe(snapshot.pages.length);
    expect(pageModel.fragments.map((fragment) => fragment.nodeId)).toEqual(
      snapshot.fragments.map((fragment) => fragment.nodeId),
    );
    expect(pageModel.metrics.pageCount).toBe(snapshot.metrics.pageCount);
  });

  it('respects manual page breaks in the saved snapshot', () => {
    const content: DocumentContent = {
      type: 'doc',
      content: [
        heading(1, 'Part One'),
        paragraph('The caravan enters the cavern market as the bells begin to ring.'),
        { type: 'pageBreak' },
        heading(1, 'Part Two'),
        paragraph('Across the bridge, the miners keep working as if the bells never stopped.'),
      ],
    };

    const snapshot = buildLayoutDocumentV2({
      content,
      preset: 'standard_pdf',
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Manual Break Fixture',
      measurementMode: 'deterministic',
      respectManualPageBreaks: true,
    });

    expect(snapshot.pages.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.pages[0]?.boundaryType).toBe('pageBreak');
  });
});
