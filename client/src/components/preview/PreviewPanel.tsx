import { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { PreviewRenderer } from './PreviewRenderer';

interface PreviewPanelProps {
  editor: Editor | null;
  theme: string;
}

type ZoomLevel = 50 | 75 | 100;

const ZOOM_OPTIONS: ZoomLevel[] = [50, 75, 100];

/**
 * Side panel that shows a scaled-down, real-time preview of the document
 * with the selected theme applied. Includes zoom controls and page-like styling.
 */
export function PreviewPanel({ editor, theme }: PreviewPanelProps) {
  const [zoom, setZoom] = useState<ZoomLevel>(75);
  const [html, setHtml] = useState('');

  const updateHtml = useCallback(() => {
    if (editor) {
      setHtml(editor.getHTML());
    }
  }, [editor]);

  // Subscribe to editor updates for real-time preview
  useEffect(() => {
    if (!editor) return;

    // Get initial content
    updateHtml();

    // Listen for editor changes
    editor.on('update', updateHtml);
    return () => {
      editor.off('update', updateHtml);
    };
  }, [editor, updateHtml]);

  const scale = zoom / 100;

  // Letter-size page proportions: 8.5 x 11 inches
  // At 96 DPI that is 816 x 1056 px
  const pageWidth = 816;

  return (
    <div className="flex flex-col h-full border-l bg-gray-100">
      {/* Header with zoom controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Preview
        </span>
        <div className="flex items-center gap-1">
          {ZOOM_OPTIONS.map((level) => (
            <button
              key={level}
              onClick={() => setZoom(level)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                zoom === level
                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {level}%
            </button>
          ))}
        </div>
      </div>

      {/* Preview content area */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="mx-auto bg-white shadow-lg rounded-sm origin-top"
          style={{
            width: pageWidth,
            minHeight: pageWidth * (11 / 8.5), // Letter proportions
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            // Adjust container to match the scaled visual size
            marginBottom: -(pageWidth * (11 / 8.5)) * (1 - scale),
          }}
        >
          <PreviewRenderer html={html} theme={theme} />
        </div>
      </div>
    </div>
  );
}
