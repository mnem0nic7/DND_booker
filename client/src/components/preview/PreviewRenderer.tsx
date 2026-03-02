import { useEffect, useRef } from 'react';

interface PreviewRendererProps {
  html: string;
  theme: string;
}

/**
 * Renders TipTap editor HTML in a themed container with print-like styling.
 * Uses an iframe to isolate the preview styles from the editor styles and
 * to allow page-size proportions (letter: 8.5 x 11 inches).
 */
export function PreviewRenderer({ html, theme }: PreviewRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Collect all stylesheets from the parent document that contain theme/block CSS
    const styleSheets = Array.from(document.styleSheets);
    let cssText = '';
    for (const sheet of styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules);
        for (const rule of rules) {
          cssText += rule.cssText + '\n';
        }
      } catch {
        // Cross-origin sheets will throw; skip them
      }
    }

    const iframeContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    ${cssText}

    /* Preview-specific overrides for print-like appearance */
    body {
      margin: 0;
      padding: 40px;
      box-sizing: border-box;
    }

    /* Override page-canvas sizing/layout — preview handles that externally */
    .page-canvas {
      width: auto;
      min-height: auto;
      margin-bottom: 0;
      padding: 0;
      box-shadow: none;
      background-image: none;
    }

    /* Page break indicators */
    .page-break {
      border-top: 2px dashed #94a3b8;
      margin: 24px 0;
      position: relative;
    }
    .page-break::after {
      content: 'Page Break';
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%);
      background: #f1f5f9;
      color: #64748b;
      font-size: 10px;
      padding: 0 8px;
      font-family: system-ui, sans-serif;
    }
  </style>
</head>
<body>
  <div data-theme="${theme}" class="page-canvas editor-themed-content" style="min-height: 100%;">
    <div class="ProseMirror">
      ${html}
    </div>
  </div>
</body>
</html>`;

    doc.open();
    doc.write(iframeContent);
    doc.close();
  }, [html, theme]);

  return (
    <iframe
      ref={iframeRef}
      title="Document Preview"
      className="w-full h-full border-0"
      sandbox="allow-same-origin"
    />
  );
}
