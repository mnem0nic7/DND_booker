import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import {
  compileMeasuredPageModel,
  renderContentWithLayoutPlan,
  renderFlowContentWithLayoutPlan,
  type DocumentContent,
  type LayoutPlan,
  type LayoutFlowModel,
  type MeasuredLayoutUnitMetric,
  type PageModel,
  type PagePreset,
} from '@dnd-booker/shared';

interface UseMeasuredLayoutDocumentOptions {
  editor: Editor | null;
  layoutPlan?: LayoutPlan | null;
  documentKind?: string | null;
  documentTitle?: string | null;
  preset: PagePreset;
  footerTitle?: string | null;
}

interface MeasuredLayoutDocumentResult {
  measurementHtml: string;
  renderedHtml: string;
  measurementRef: RefObject<HTMLDivElement | null>;
  pageModel: PageModel | null;
}

function collectUnitMeasurements(root: HTMLElement): MeasuredLayoutUnitMetric[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-layout-unit-id]'))
    .map((element) => {
      const unitId = element.dataset.layoutUnitId;
      if (!unitId) return null;
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

export function useMeasuredLayoutDocument({
  editor,
  layoutPlan = null,
  documentKind = null,
  documentTitle = null,
  preset,
  footerTitle = null,
}: UseMeasuredLayoutDocumentOptions): MeasuredLayoutDocumentResult {
  const measurementRef = useRef<HTMLDivElement>(null);
  const flowModelRef = useRef<LayoutFlowModel | null>(null);
  const contentRef = useRef<DocumentContent | null>(null);
  const [measurementHtml, setMeasurementHtml] = useState('');
  const [renderedHtml, setRenderedHtml] = useState('');
  const [pageModel, setPageModel] = useState<PageModel | null>(null);

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
    setMeasurementHtml(rendered.html);
    setPageModel(rendered.pageModel);
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
      const measurements = collectUnitMeasurements(measurementRef.current!);
      const measuredPageModel = compileMeasuredPageModel(flowModelRef.current!, measurements, {
        documentKind,
        documentTitle,
      });
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
  }, [documentKind, documentTitle, footerTitle, layoutPlan, measurementHtml, preset]);

  return {
    measurementHtml,
    renderedHtml,
    measurementRef,
    pageModel,
  };
}
