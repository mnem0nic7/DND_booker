import type { MeasuredLayoutDocumentResult } from '../../lib/useMeasuredLayoutDocument';
import { RenderedDocumentCanvas } from './RenderedDocumentCanvas';
import { renderWithProviders } from '../../test/render';

function createMeasuredDocument(): MeasuredLayoutDocumentResult {
  return {
    measurementHtml: '<div class="layout-flow-root"><div data-layout-unit-id="unit:sidebarcallout-1"><div data-node-id="sidebarcallout-1"></div></div></div>',
    renderedHtml: '<div class="layout-page-stack"></div>',
    measurementRef: { current: null },
    layoutSnapshot: null,
    pageModel: null,
    measurements: [],
    pageMetrics: null,
    textLayoutTelemetry: null,
    shadowTelemetry: null,
  };
}

describe('RenderedDocumentCanvas', () => {
  it('wraps the hidden measurement html in a ProseMirror typography shell', () => {
    const { container } = renderWithProviders(
      <RenderedDocumentCanvas
        editor={null}
        theme="gilded-folio"
        measuredDocument={createMeasuredDocument()}
        pageSize="letter"
        columnCount={2}
        showTexture
        selectedNodeId={null}
        onSelectNodeId={vi.fn()}
        onReorderNode={vi.fn()}
      />,
    );

    const measurementCanvas = container.querySelector('.parity-measure-canvas');
    expect(measurementCanvas).toBeTruthy();
    const typographyShell = measurementCanvas?.querySelector('.parity-measure-flow.ProseMirror');
    expect(typographyShell).toBeTruthy();
    expect(typographyShell?.querySelector('[data-layout-unit-id="unit:sidebarcallout-1"]')).toBeTruthy();
  });

  it('applies the live page-size and column-count attributes to the paginated surface', () => {
    const { container } = renderWithProviders(
      <RenderedDocumentCanvas
        editor={null}
        theme="gilded-folio"
        measuredDocument={createMeasuredDocument()}
        pageSize="a5"
        columnCount={1}
        showTexture={false}
        selectedNodeId={null}
        onSelectNodeId={vi.fn()}
        onReorderNode={vi.fn()}
      />,
    );

    const liveCanvas = container.querySelector('.parity-live-canvas');
    expect(liveCanvas).toHaveAttribute('data-page-size', 'a5');
    expect(liveCanvas).toHaveAttribute('data-columns', '1');
    expect(liveCanvas).toHaveAttribute('data-texture-off', '');
  });
});
