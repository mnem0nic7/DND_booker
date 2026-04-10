import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';

// Default: 11in at 96dpi = 1056px, minus 72px top + 72px bottom = 912px, minus 48px reserve = 864px.
const DEFAULT_PAGE_CONTENT_HEIGHT = 864;

// Pages with less than this much content collapse to a compact separator
// instead of filling a near-blank page. ~80px ≈ one heading line.
const MIN_CONTENT_FOR_FULL_PAGE = 80;

/** Read --page-content-height from .page-canvas via computed style. */
function getPageContentHeight(pmEl: HTMLElement): number {
  const canvas = pmEl.closest('.page-canvas, .parity-live-editor-shell') as HTMLElement | null;
  if (!canvas) return DEFAULT_PAGE_CONTENT_HEIGHT;
  const raw = getComputedStyle(canvas).getPropertyValue('--page-content-height').trim();
  return parseInt(raw, 10) || DEFAULT_PAGE_CONTENT_HEIGHT;
}

/**
 * Aligns page break nodes to 8.5x11 page boundaries by adding fill
 * padding so each page break sits at the bottom of its page.
 *
 * The wrapper (.node-pageBreak) is transparent — the fill area shows
 * the parchment background from .page-canvas. The inner .page-break
 * element renders the dark gap between pages.
 */
export function usePageAlignment(editor: Editor | null) {
  const rafRef = useRef(0);

  useEffect(() => {
    if (!editor || !editor.view?.dom) return;

    const align = () => {
      if (!editor.view?.dom) return;
      const pmEl = editor.view.dom as HTMLElement;
      const pageBreaks = pmEl.querySelectorAll<HTMLElement>('.node-pageBreak');
      if (!pageBreaks.length) return;

      const PAGE_CONTENT_HEIGHT = getPageContentHeight(pmEl);

      // Reset all fills to 0 so we measure natural positions
      pageBreaks.forEach((pb) => {
        pb.style.paddingTop = '0';
      });

      // Force synchronous reflow
      void pmEl.offsetHeight;

      const pmTop = pmEl.getBoundingClientRect().top;
      let nextPageEnd = PAGE_CONTENT_HEIGHT;

      pageBreaks.forEach((pb) => {
        const pbTop = pb.getBoundingClientRect().top - pmTop;

        // Advance to the page boundary at or after this break
        while (nextPageEnd < pbTop) {
          nextPageEnd += PAGE_CONTENT_HEIGHT;
        }

        // Fill from current position to the page boundary.
        // If the page would be nearly blank, collapse to a compact separator
        // to avoid wasting a full page of blank space in the editor.
        const rawFill = Math.max(0, nextPageEnd - pbTop);
        const fill = rawFill > PAGE_CONTENT_HEIGHT - MIN_CONTENT_FOR_FULL_PAGE ? 48 : rawFill;
        pb.style.paddingTop = `${fill}px`;

        // Force reflow so subsequent measurements are accurate
        void pb.offsetHeight;

        // Next page ends one page-height after this break's bottom edge
        const pbBottom = pb.getBoundingClientRect().bottom - pmTop;
        nextPageEnd = pbBottom + PAGE_CONTENT_HEIGHT;
      });
    };

    const scheduleAlign = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(align);
    };

    // Align on content changes and initial render
    scheduleAlign();
    editor.on('update', scheduleAlign);

    // Re-align when editor resizes (e.g. column toggle, panel open/close)
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        cancelAnimationFrame(rafRef.current);
        editor.off('update', scheduleAlign);
      };
    }
    const observer = new ResizeObserver(scheduleAlign);
    observer.observe(editor.view.dom);

    return () => {
      cancelAnimationFrame(rafRef.current);
      editor.off('update', scheduleAlign);
      observer.disconnect();
    };
  }, [editor]);
}
