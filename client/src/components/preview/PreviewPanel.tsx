import { useState, useEffect, useRef, useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { getCanonicalLayoutCss, type LayoutPlan } from '@dnd-booker/shared';
import { useMeasuredLayoutDocument } from '../../lib/useMeasuredLayoutDocument';

interface PreviewPanelProps {
  editor: Editor | null;
  theme: string;
  layoutPlan?: LayoutPlan | null;
  documentKind?: string | null;
  documentTitle?: string | null;
}

type ZoomLevel = 50 | 75 | 100;

const ZOOM_OPTIONS: ZoomLevel[] = [50, 75, 100];

// Letter-size page proportions: 8.5 x 11 inches at 96 DPI = 816 x 1056 px
const PAGE_WIDTH = 816;

/**
 * Side panel that shows a scaled-down, real-time preview of the document
 * with the selected theme applied. Uses the shared tiptapToHtml renderer
 * so custom D&D blocks (stat blocks, spell cards, etc.) render fully.
 */
export function PreviewPanel({
  editor,
  theme,
  layoutPlan = null,
  documentKind = null,
  documentTitle = null,
}: PreviewPanelProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(75);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { measurementHtml, renderedHtml, measurementRef, pageModel } = useMeasuredLayoutDocument({
    editor,
    layoutPlan,
    documentKind,
    documentTitle,
    preset: 'editor_preview',
    footerTitle: documentTitle,
  });

  // Measure container width for fit-to-width scaling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Calculate scale: fit page to available width, then apply zoom multiplier
  const padding = 32; // p-4 = 16px each side
  const availableWidth = Math.max(containerWidth - padding, 100);
  const fitScale = availableWidth / PAGE_WIDTH;
  const scale = fitScale * (zoom / 75); // 75% = fit-to-width baseline
  const pageCount = Math.max(1, pageModel?.pages.length ?? 1);
  const previewHeight = (PAGE_WIDTH * (11 / 8.5) * pageCount) + (Math.max(0, pageCount - 1) * 32);
  const previewMarkup = useMemo(() => ({ __html: renderedHtml }), [renderedHtml]);
  const measurementMarkup = useMemo(() => ({ __html: measurementHtml }), [measurementHtml]);

  return (
    <div className="flex flex-col h-full border-l bg-gray-100">
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Preview
        </span>
        <div className="flex items-center bg-gray-100 rounded-md p-0.5">
          {ZOOM_OPTIONS.map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              aria-label={`Zoom to ${level}%`}
              className={`px-2.5 py-0.5 text-xs rounded transition-all ${
                zoom === level
                  ? 'bg-white text-purple-700 font-medium shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {level}%
            </button>
          ))}
        </div>
      </div>

      {/* Preview content area */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        <style>{getCanonicalLayoutCss()}</style>
        <div className="parity-measure-host" aria-hidden="true">
          <div ref={measurementRef} className="page-canvas editor-themed-content parity-measure-canvas" data-theme={theme} dangerouslySetInnerHTML={measurementMarkup} />
        </div>
        <div
          data-theme={theme}
          className="mx-auto editor-themed-content rounded-sm"
          style={{
            width: PAGE_WIDTH,
            minHeight: previewHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // Shrink the container box to match the visual scaled size
            marginBottom: -(previewHeight) * (1 - scale),
            marginRight: -PAGE_WIDTH * (1 - scale),
            boxShadow:
              '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06), 0 -1px 0 rgba(0,0,0,0.02)',
          }}
          dangerouslySetInnerHTML={previewMarkup}
        />
      </div>
    </div>
  );
}
