import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
  buildLayoutDocumentV2,
  buildFlowTextLayoutShadowTelemetry,
  buildPageMetricsSnapshotFromPageModel,
  compileMeasuredPageModel,
  layoutDocumentV2ToPageModel,
  measureFlowTextUnits,
  parseTextLayoutEngineMode,
  renderContentWithLayoutPlan,
  renderFlowContentWithLayoutPlan,
  type DocumentContent,
  type FlowTextLayoutShadowTelemetry,
  type FlowTextLayoutTelemetry,
  type LayoutDocumentV2,
  type LayoutPlan,
  type LayoutFlowModel,
  type MeasuredLayoutUnitMetric,
  type PageMetricsSnapshot,
  type PageModel,
  type PagePreset,
} from '@dnd-booker/shared';

interface UseMeasuredLayoutDocumentOptions {
  editor: Editor | null;
  initialContent: DocumentContent;
  initialLayoutSnapshot?: LayoutDocumentV2 | null;
  theme?: string | null;
  layoutPlan?: LayoutPlan | null;
  fallbackScopeIds?: string[];
  documentKind?: string | null;
  documentTitle?: string | null;
  preset: PagePreset;
  footerTitle?: string | null;
}

export interface MeasuredLayoutDocumentResult {
  measurementHtml: string;
  renderedHtml: string;
  measurementRef: RefObject<HTMLDivElement | null>;
  layoutSnapshot: LayoutDocumentV2 | null;
  pageModel: PageModel | null;
  measurements: MeasuredLayoutUnitMetric[];
  pageMetrics: PageMetricsSnapshot | null;
  textLayoutTelemetry: FlowTextLayoutTelemetry | null;
  shadowTelemetry: FlowTextLayoutShadowTelemetry | null;
}

interface InitialMeasuredLayoutState {
  measurementHtml: string;
  renderedHtml: string;
  layoutSnapshot: LayoutDocumentV2 | null;
  pageModel: PageModel | null;
  pageMetrics: PageMetricsSnapshot | null;
}

function collectUnitMeasurements(root: HTMLElement, unitIds?: readonly string[]): MeasuredLayoutUnitMetric[] {
  const allowedUnitIds = unitIds ? new Set(unitIds) : null;
  return Array.from(root.querySelectorAll<HTMLElement>('[data-layout-unit-id]'))
    .map((element) => {
      const unitId = element.dataset.layoutUnitId;
      if (!unitId || (allowedUnitIds && !allowedUnitIds.has(unitId))) return null;
      const computed = window.getComputedStyle(element);
      const marginTop = Number.parseFloat(computed.marginTop || '0') || 0;
      const marginBottom = Number.parseFloat(computed.marginBottom || '0') || 0;
      const contentHeight = Math.max(
        element.getBoundingClientRect().height,
        element.scrollHeight,
        element.offsetHeight,
      );
      return {
        unitId,
        heightPx: Math.max(1, Math.ceil(contentHeight + marginTop + marginBottom)),
      };
    })
    .filter((entry): entry is MeasuredLayoutUnitMetric => Boolean(entry));
}

function buildInitialMeasuredLayoutState(input: {
  content: DocumentContent;
  initialLayoutSnapshot?: LayoutDocumentV2 | null;
  theme: string | null;
  layoutPlan: LayoutPlan | null;
  documentKind: string | null;
  documentTitle: string | null;
  preset: PagePreset;
  footerTitle: string | null;
}): InitialMeasuredLayoutState {
  const measurementHtml = renderFlowContentWithLayoutPlan({
    content: input.content,
    layoutPlan: input.layoutPlan,
    preset: input.preset,
    options: {
      documentKind: input.documentKind,
      documentTitle: input.documentTitle,
    },
  }).html;

  const layoutSnapshot = input.initialLayoutSnapshot && input.initialLayoutSnapshot.preset === input.preset
    ? input.initialLayoutSnapshot
    : buildLayoutDocumentV2({
        content: input.content,
        layoutPlan: input.layoutPlan,
        preset: input.preset,
        theme: input.theme ?? 'gilded-folio',
        documentKind: input.documentKind,
        documentTitle: input.documentTitle,
        measurementMode: 'deterministic',
        respectManualPageBreaks: true,
      });
  const pageModel = layoutDocumentV2ToPageModel(layoutSnapshot);

  return {
    measurementHtml,
    renderedHtml: renderContentWithLayoutPlan({
      content: input.content,
      layoutPlan: input.layoutPlan,
      pageModel,
      preset: input.preset,
      options: {
        documentKind: input.documentKind,
        documentTitle: input.documentTitle,
      },
      footerTitle: input.footerTitle,
    }).html,
    layoutSnapshot,
    pageModel,
    pageMetrics: buildPageMetricsSnapshotFromPageModel(pageModel, {
      documentKind: input.documentKind,
      documentTitle: input.documentTitle,
    }),
  };
}

export function useMeasuredLayoutDocument({
  editor,
  initialContent,
  initialLayoutSnapshot = null,
  theme = 'gilded-folio',
  layoutPlan = null,
  fallbackScopeIds = [],
  documentKind = null,
  documentTitle = null,
  preset,
  footerTitle = null,
}: UseMeasuredLayoutDocumentOptions): MeasuredLayoutDocumentResult {
  const textLayoutMode = parseTextLayoutEngineMode(import.meta.env.VITE_TEXT_LAYOUT_ENGINE_MODE);
  const fallbackScopeIdsKey = fallbackScopeIds.join('|');
  const measurementRef = useRef<HTMLDivElement>(null);
  const flowModelRef = useRef<LayoutFlowModel | null>(null);
  const contentRef = useRef<DocumentContent | null>(null);
  const initialStateRef = useRef<InitialMeasuredLayoutState | null>(null);
  if (initialStateRef.current === null) {
    initialStateRef.current = buildInitialMeasuredLayoutState({
      content: initialContent,
      initialLayoutSnapshot,
      theme,
      layoutPlan,
      documentKind,
      documentTitle,
      preset,
      footerTitle,
    });
  }
  const initialState = initialStateRef.current;
  const [measurementHtml, setMeasurementHtml] = useState(initialState.measurementHtml);
  const [renderedHtml, setRenderedHtml] = useState(initialState.renderedHtml);
  const [layoutSnapshot, setLayoutSnapshot] = useState<LayoutDocumentV2 | null>(initialState.layoutSnapshot);
  const [pageModel, setPageModel] = useState<PageModel | null>(initialState.pageModel);
  const [measurements, setMeasurements] = useState<MeasuredLayoutUnitMetric[]>([]);
  const [pageMetrics, setPageMetrics] = useState<PageMetricsSnapshot | null>(initialState.pageMetrics);
  const [textLayoutTelemetry, setTextLayoutTelemetry] = useState<FlowTextLayoutTelemetry | null>(null);
  const [shadowTelemetry, setShadowTelemetry] = useState<FlowTextLayoutShadowTelemetry | null>(null);

  const rebuildFlow = useCallback(() => {
    if (!editor) return;

    const content = editor.getJSON() as DocumentContent;
    contentRef.current = content;
    const rendered = renderFlowContentWithLayoutPlan({
      content,
      layoutPlan,
      preset,
      options: {
        documentKind,
        documentTitle,
      },
    });

    flowModelRef.current = rendered.flowModel;
    const initialSnapshot = buildLayoutDocumentV2({
      content,
      layoutPlan,
      preset,
      theme,
      documentKind,
      documentTitle,
      measurementMode: textLayoutMode === 'legacy' ? 'estimated' : 'deterministic',
      respectManualPageBreaks: true,
    });
    const initialPageModel = layoutDocumentV2ToPageModel(initialSnapshot);
    setMeasurementHtml(rendered.html);
    setLayoutSnapshot(initialSnapshot);
    setPageModel(initialPageModel);
    setPageMetrics(buildPageMetricsSnapshotFromPageModel(initialPageModel, {
      documentKind,
      documentTitle,
    }));
    setMeasurements([]);
    setTextLayoutTelemetry(null);
    setShadowTelemetry(null);
    setRenderedHtml(
      renderContentWithLayoutPlan({
        content,
        layoutPlan,
        pageModel: rendered.pageModel,
        preset,
        options: {
          documentKind,
          documentTitle,
        },
        footerTitle,
      }).html,
    );
  }, [documentKind, documentTitle, editor, footerTitle, layoutPlan, preset]);

  useEffect(() => {
    if (!editor) return;
    rebuildFlow();
    editor.on('update', rebuildFlow);
    return () => {
      editor.off('update', rebuildFlow);
    };
  }, [editor, rebuildFlow]);

  useLayoutEffect(() => {
    if (!measurementHtml || !measurementRef.current || !flowModelRef.current || !contentRef.current) return;

    const handle = window.requestAnimationFrame(() => {
      const flowModel = flowModelRef.current!;
      let legacyMeasurements: MeasuredLayoutUnitMetric[] = [];
      let legacyPageModel: PageModel | null = null;
      let finalMeasurements: MeasuredLayoutUnitMetric[] = [];
      let measuredPageModel: PageModel | null = null;
      let nextLayoutSnapshot: LayoutDocumentV2 | null = null;
      let nextTextLayoutTelemetry: FlowTextLayoutTelemetry | null = null;
      let nextShadowTelemetry: FlowTextLayoutShadowTelemetry | null = null;

      if (textLayoutMode === 'legacy' || textLayoutMode === 'shadow') {
        legacyMeasurements = collectUnitMeasurements(measurementRef.current!);
        legacyPageModel = compileMeasuredPageModel(flowModel, legacyMeasurements, {
          documentKind,
          documentTitle,
        });
      }

      if (textLayoutMode === 'legacy') {
        finalMeasurements = legacyMeasurements;
        measuredPageModel = legacyPageModel;
      } else {
        const engineResult = textLayoutMode === 'shadow'
          ? measureFlowTextUnits(flowModel, {
            theme,
            documentKind,
            documentTitle,
            fallbackMeasurements: legacyMeasurements,
            fallbackScopeIds,
          })
          : (() => {
            const initialResult = measureFlowTextUnits(flowModel, {
              theme,
              documentKind,
              documentTitle,
              fallbackScopeIds,
            });
            const requiredFallbackScopeIds = [...new Set([
              ...initialResult.unsupportedUnitIds,
              ...fallbackScopeIds,
            ])];
            if (requiredFallbackScopeIds.length === 0) {
              return initialResult;
            }
            const fallbackMeasurements = collectUnitMeasurements(measurementRef.current!, requiredFallbackScopeIds);
            return measureFlowTextUnits(flowModel, {
              theme,
              documentKind,
              documentTitle,
              fallbackMeasurements,
              fallbackScopeIds,
            });
          })();
        const enginePageModel = compileMeasuredPageModel(flowModel, engineResult.measurements, {
          documentKind,
          documentTitle,
          respectManualPageBreaks: true,
        });

        nextTextLayoutTelemetry = engineResult.telemetry;

        if (textLayoutMode === 'shadow' && legacyPageModel) {
          nextShadowTelemetry = buildFlowTextLayoutShadowTelemetry({
            legacyMeasurements,
            engineMeasurements: engineResult.measurements,
            engineTelemetry: engineResult.telemetry,
            legacyPageCount: legacyPageModel.pages.length,
            pretextPageCount: enginePageModel.pages.length,
            unsupportedScopeIds: engineResult.unsupportedUnitIds,
          });
          console.info('[text-layout:shadow]', {
            scope: 'client-editor',
            mode: textLayoutMode,
            documentTitle,
            preset,
            ...nextShadowTelemetry,
          });
        }

        finalMeasurements = textLayoutMode === 'pretext'
          ? engineResult.measurements
          : legacyMeasurements;
        measuredPageModel = textLayoutMode === 'pretext'
          ? enginePageModel
          : legacyPageModel;
      }

      if (!measuredPageModel) return;

      nextLayoutSnapshot = buildLayoutDocumentV2({
        content: contentRef.current!,
        layoutPlan,
        preset,
        theme,
        measurements: finalMeasurements,
        fallbackScopeIds,
        documentKind,
        documentTitle,
        measurementMode: textLayoutMode === 'legacy' ? 'browser_capture' : 'deterministic',
        respectManualPageBreaks: true,
      });
      measuredPageModel = layoutDocumentV2ToPageModel(nextLayoutSnapshot);

      setMeasurements(finalMeasurements);
      setLayoutSnapshot(nextLayoutSnapshot);
      setTextLayoutTelemetry(nextTextLayoutTelemetry);
      setShadowTelemetry(nextShadowTelemetry);
      setPageMetrics(buildPageMetricsSnapshotFromPageModel(measuredPageModel, {
        documentKind,
        documentTitle,
      }));
      setPageModel(measuredPageModel);
      setRenderedHtml(
        renderContentWithLayoutPlan({
          content: contentRef.current!,
          layoutPlan,
          pageModel: measuredPageModel,
          preset,
          options: {
            documentKind,
            documentTitle,
          },
          footerTitle,
        }).html,
      );
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [documentKind, documentTitle, fallbackScopeIdsKey, footerTitle, layoutPlan, measurementHtml, preset, textLayoutMode, theme]);

  return {
    measurementHtml,
    renderedHtml,
    measurementRef,
    layoutSnapshot,
    pageModel,
    measurements,
    pageMetrics,
    textLayoutTelemetry,
    shadowTelemetry,
  };
}
