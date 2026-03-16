import { useState, useEffect, useCallback, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { renderContentWithLayoutPlan } from '@dnd-booker/shared';
import type { DocumentContent, LayoutPlan } from '@dnd-booker/shared';
import { PreviewRenderer } from './PreviewRenderer';

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
  const [html, setHtml] = useState('');
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateHtml = useCallback(() => {
    if (editor) {
      const json = editor.getJSON() as DocumentContent;
      const rendered = renderContentWithLayoutPlan({
        content: json,
        layoutPlan,
        preset: 'editor_preview',
        options: {
          documentKind,
          documentTitle,
        },
      });
      setHtml(rendered.html);
    }
  }, [documentKind, documentTitle, editor, layoutPlan]);

  // Subscribe to editor updates for real-time preview
  useEffect(() => {
    if (!editor) return;
    updateHtml();
    editor.on('update', updateHtml);
    return () => {
      editor.off('update', updateHtml);
    };
  }, [editor, updateHtml]);

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
        <div
          className="mx-auto bg-white rounded-sm"
          style={{
            width: PAGE_WIDTH,
            minHeight: PAGE_WIDTH * (11 / 8.5),
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // Shrink the container box to match the visual scaled size
            marginBottom: -(PAGE_WIDTH * (11 / 8.5)) * (1 - scale),
            marginRight: -PAGE_WIDTH * (1 - scale),
            boxShadow:
              '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06), 0 -1px 0 rgba(0,0,0,0.02)',
          }}
        >
          <PreviewRenderer html={html} theme={theme} />
        </div>
      </div>
    </div>
  );
}
