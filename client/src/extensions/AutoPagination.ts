import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * AutoPagination — Google Docs-style fixed pages via ProseMirror widget decorations.
 *
 * Walks top-level nodes, classifies them as column-spanning or column-flowing,
 * groups consecutive flowing nodes, measures effective heights, and inserts
 * column-spanning gap decorations at page boundaries (864px intervals).
 *
 * Does NOT touch pageBreak nodes — those are handled by usePageAlignment.
 */

// 11in at 96dpi = 1056px, minus 72px top + 72px bottom padding = 912px.
// Reserve 48px bottom margin so content doesn't touch the gap edge.
const PAGE_CONTENT_HEIGHT = 864;

// Dark gap between pages (height of the ::after pseudo-element)
const GAP_HEIGHT = 56;

// Node types that use column-span: all in CSS
const COLUMN_SPANNING_TYPES = new Set([
  'pageBreak',
  'titlePage',
  'creditsPage',
  'backCover',
  'tableOfContents',
  'chapterHeader',
  'fullBleedImage',
]);

const pluginKey = new PluginKey('autoPagination');

// ── Segment types ──────────────────────────────────────────

interface SpanningSegment {
  kind: 'spanning';
  pos: number;
  typeName: string;
}

interface ColumnGroupSegment {
  kind: 'group';
  nodes: Array<{ pos: number }>;
}

type Segment = SpanningSegment | ColumnGroupSegment;

// ── Helpers ────────────────────────────────────────────────

function createGapElement(fillHeight: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'auto-page-gap';
  // Total height = remaining page space + dark gap.
  // The CSS padding-bottom adds NEXT_PAGE_MARGIN on top of this.
  el.style.height = `${fillHeight + GAP_HEIGHT}px`;
  el.setAttribute('contenteditable', 'false');
  return el;
}

/** Classify top-level nodes into spanning segments and column groups. */
function buildSegments(doc: PMNode): Segment[] {
  const segments: Segment[] = [];
  let currentGroup: ColumnGroupSegment | null = null;

  doc.forEach((node, offset) => {
    if (COLUMN_SPANNING_TYPES.has(node.type.name)) {
      if (currentGroup && currentGroup.nodes.length > 0) {
        segments.push(currentGroup);
        currentGroup = null;
      }
      segments.push({ kind: 'spanning', pos: offset, typeName: node.type.name });
    } else {
      if (!currentGroup) {
        currentGroup = { kind: 'group', nodes: [] };
      }
      currentGroup.nodes.push({ pos: offset });
    }
  });

  // TypeScript can't narrow through forEach closure — use explicit check
  const lastGroup = currentGroup as ColumnGroupSegment | null;
  if (lastGroup && lastGroup.nodes.length > 0) {
    segments.push(lastGroup);
  }

  return segments;
}

/** Get the bounding rect top/bottom of a spanning node's DOM element. */
function getSpannerBounds(
  view: EditorView,
  pos: number,
): { top: number; bottom: number } | null {
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!dom) return null;
  const rect = dom.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

// ── Core computation ───────────────────────────────────────

interface GapInfo {
  pos: number;
  fillHeight: number;
}

function computeGaps(view: EditorView): GapInfo[] {
  const { doc } = view.state;
  if (doc.childCount === 0) return [];

  const segments = buildSegments(doc);
  if (segments.length === 0) return [];

  const pmEl = view.dom as HTMLElement;
  const pmRect = pmEl.getBoundingClientRect();
  const colCount = parseInt(window.getComputedStyle(pmEl).columnCount, 10) || 1;

  // Pre-compute bounding boxes for all spanning elements
  const spannerBoundsMap = new Map<number, { top: number; bottom: number }>();
  for (const seg of segments) {
    if (seg.kind === 'spanning') {
      const bounds = getSpannerBounds(view, seg.pos);
      if (bounds) spannerBoundsMap.set(seg.pos, bounds);
    }
  }

  const gaps: GapInfo[] = [];
  let pageFill = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.kind === 'spanning') {
      // pageBreak resets page fill — usePageAlignment handles the visual fill
      if (seg.typeName === 'pageBreak') {
        pageFill = 0;
        continue;
      }

      const bounds = spannerBoundsMap.get(seg.pos);
      const height = bounds ? bounds.bottom - bounds.top : 0;

      // Would this spanning element overflow the current page?
      if (pageFill > 0 && pageFill + height > PAGE_CONTENT_HEIGHT) {
        gaps.push({
          pos: seg.pos,
          fillHeight: Math.max(0, PAGE_CONTENT_HEIGHT - pageFill),
        });
        pageFill = 0;
      }

      pageFill += height;

      // If the element is taller than a page, let it overflow naturally
      while (pageFill >= PAGE_CONTENT_HEIGHT) {
        pageFill -= PAGE_CONTENT_HEIGHT;
      }

      continue;
    }

    // ── Column group ───────────────────────────────────

    // Measure group height as distance between surrounding spanning elements.
    // This gives the actual rendered height including CSS column balancing.
    let prevBottom = pmRect.top;
    for (let j = i - 1; j >= 0; j--) {
      const prev = segments[j];
      if (prev.kind === 'spanning') {
        const bounds = spannerBoundsMap.get(prev.pos);
        if (bounds) prevBottom = bounds.bottom;
        break;
      }
    }

    let nextTop = pmRect.bottom;
    for (let j = i + 1; j < segments.length; j++) {
      const next = segments[j];
      if (next.kind === 'spanning') {
        const bounds = spannerBoundsMap.get(next.pos);
        if (bounds) nextTop = bounds.top;
        break;
      }
    }

    const groupHeight = Math.max(0, nextTop - prevBottom);

    if (pageFill + groupHeight <= PAGE_CONTENT_HEIGHT) {
      // Group fits entirely on the current page
      pageFill += groupHeight;
    } else if (groupHeight <= PAGE_CONTENT_HEIGHT && pageFill > 0) {
      // Group fits on a fresh page — insert gap before the group
      gaps.push({
        pos: seg.nodes[0].pos,
        fillHeight: Math.max(0, PAGE_CONTENT_HEIGHT - pageFill),
      });
      pageFill = groupHeight;
    } else {
      // Group spans multiple pages — estimate split points within the group.
      // In multi-column layout, each node's effective height ≈ DOM height ÷ colCount.
      let accumulated = 0;
      let remaining = PAGE_CONTENT_HEIGHT - pageFill;

      for (const n of seg.nodes) {
        const dom = view.nodeDOM(n.pos) as HTMLElement | null;
        if (!dom) continue;

        const nodeHeight = dom.getBoundingClientRect().height;
        const effectiveHeight = colCount > 1 ? nodeHeight / colCount : nodeHeight;

        if (accumulated + effectiveHeight > remaining && accumulated > 0) {
          gaps.push({
            pos: n.pos,
            fillHeight: Math.max(0, remaining - accumulated),
          });
          accumulated = effectiveHeight;
          remaining = PAGE_CONTENT_HEIGHT;
        } else {
          accumulated += effectiveHeight;
        }
      }

      pageFill = accumulated;
    }

    while (pageFill >= PAGE_CONTENT_HEIGHT) {
      pageFill -= PAGE_CONTENT_HEIGHT;
    }
  }

  return gaps;
}

// ── Extension ──────────────────────────────────────────────

export const AutoPagination = Extension.create({
  name: 'autoPagination',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(pluginKey);
            if (meta !== undefined) return meta;
            if (tr.docChanged) return value.map(tr.mapping, newState.doc);
            return value;
          },
        },

        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },

        view(editorView) {
          let rafId = 0;
          let isComputing = false;
          let lastGapKey = '';
          let resizeObserver: ResizeObserver | null = null;

          const compute = () => {
            if (isComputing || editorView.isDestroyed) return;
            isComputing = true;

            // Disconnect observer during computation to avoid self-triggering
            resizeObserver?.disconnect();

            try {
              // Phase 1: Clear existing gap decorations
              editorView.dispatch(
                editorView.state.tr.setMeta(pluginKey, DecorationSet.empty),
              );

              // Phase 2: Force synchronous reflow to get natural positions
              void editorView.dom.offsetHeight;

              // Phase 3: Compute gap positions
              const gaps = computeGaps(editorView);

              // Phase 4: Skip dispatch if gaps haven't changed (prevents oscillation)
              const newKey = gaps
                .map((g) => `${g.pos}:${g.fillHeight}`)
                .join('|');
              if (newKey === lastGapKey && gaps.length > 0) {
                // Re-apply same decorations (they were cleared in phase 1)
                const decos = gaps.map((g) =>
                  Decoration.widget(g.pos, () => createGapElement(g.fillHeight), {
                    side: -1,
                    key: `auto-gap-${g.pos}`,
                  }),
                );
                editorView.dispatch(
                  editorView.state.tr.setMeta(
                    pluginKey,
                    DecorationSet.create(editorView.state.doc, decos),
                  ),
                );
                return;
              }
              lastGapKey = newKey;

              // Phase 5: Apply new decorations
              if (gaps.length > 0) {
                const decos = gaps.map((g) =>
                  Decoration.widget(g.pos, () => createGapElement(g.fillHeight), {
                    side: -1,
                    key: `auto-gap-${g.pos}`,
                  }),
                );
                editorView.dispatch(
                  editorView.state.tr.setMeta(
                    pluginKey,
                    DecorationSet.create(editorView.state.doc, decos),
                  ),
                );
              }
            } finally {
              isComputing = false;

              // Re-observe after layout settles
              requestAnimationFrame(() => {
                if (!editorView.isDestroyed) {
                  resizeObserver?.observe(editorView.dom);
                }
              });
            }
          };

          const schedule = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(compute);
          };

          resizeObserver = new ResizeObserver(schedule);
          resizeObserver.observe(editorView.dom);

          // Initial computation after first render
          schedule();

          return {
            update(_view, prevState) {
              if (!isComputing && editorView.state.doc !== prevState.doc) {
                schedule();
              }
            },
            destroy() {
              cancelAnimationFrame(rafId);
              resizeObserver?.disconnect();
              resizeObserver = null;
            },
          };
        },
      }),
    ];
  },
});
