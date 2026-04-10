import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { LayoutDocumentV2 } from '@dnd-booker/shared';

const DEFAULT_PAGE_CONTENT_HEIGHT = 880;
const GAP_HEIGHT = 56;
const pluginKey = new PluginKey<DecorationSet>('snapshotPagination');

function getPageContentHeight(pmEl: HTMLElement): number {
  const raw = getComputedStyle(pmEl).getPropertyValue('--page-content-height').trim();
  return parseInt(raw, 10) || DEFAULT_PAGE_CONTENT_HEIGHT;
}

function createGapElement(fillHeight: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'auto-page-gap';
  el.style.height = `${fillHeight + GAP_HEIGHT}px`;
  el.setAttribute('contenteditable', 'false');
  return el;
}

function createPageTailElement(fillHeight: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'auto-page-tail';
  el.style.height = `${fillHeight}px`;
  el.setAttribute('contenteditable', 'false');
  return el;
}

function buildTopLevelPositionMap(view: EditorView): Map<string, { pos: number; nodeSize: number }> {
  const positions = new Map<string, { pos: number; nodeSize: number }>();
  view.state.doc.forEach((node, offset) => {
    const nodeId = typeof node.attrs?.nodeId === 'string' ? String(node.attrs.nodeId) : null;
    if (!nodeId) return;
    positions.set(nodeId, { pos: offset + 1, nodeSize: node.nodeSize });
  });
  return positions;
}

function buildSnapshotDecorationSet(view: EditorView, snapshot: LayoutDocumentV2 | null): DecorationSet {
  if (!snapshot || snapshot.pages.length === 0) {
    return DecorationSet.empty;
  }

  const positions = buildTopLevelPositionMap(view);
  const fragmentsById = new Map(snapshot.fragments.map((fragment) => [fragment.id, fragment] as const));
  const decorations: Decoration[] = [];
  const pageContentHeight = getPageContentHeight(view.dom as HTMLElement);

  for (let index = 1; index < snapshot.pages.length; index += 1) {
    const previousPage = snapshot.pages[index - 1];
    const page = snapshot.pages[index];
    const firstFragment = page.fragmentIds
      .map((fragmentId) => fragmentsById.get(fragmentId))
      .filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment))
      .sort((left, right) => {
        if ((left.columnIndex ?? 0) !== (right.columnIndex ?? 0)) {
          return (left.columnIndex ?? 0) - (right.columnIndex ?? 0);
        }
        if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
        return left.presentationOrder - right.presentationOrder;
      })[0];

    if (!firstFragment) continue;
    const target = positions.get(firstFragment.nodeId);
    if (!target) continue;

    if (previousPage.boundaryType === 'autoGap') {
      const fillHeight = Math.max(0, pageContentHeight - previousPage.contentHeightPx);
      decorations.push(
        Decoration.widget(
          target.pos,
          () => createGapElement(fillHeight),
          {
            side: -1,
            key: `snapshot-gap-${page.index}-${firstFragment.nodeId}`,
          },
        ),
      );
    }
  }

  for (const page of snapshot.pages) {
    const firstRightColumnFragment = page.fragmentIds
      .map((fragmentId) => fragmentsById.get(fragmentId))
      .filter((fragment): fragment is NonNullable<typeof fragment> => Boolean(fragment))
      .filter((fragment) => fragment.columnIndex === 2)
      .sort((left, right) => {
        if (left.bounds.y !== right.bounds.y) return left.bounds.y - right.bounds.y;
        return left.presentationOrder - right.presentationOrder;
      })[0];
    if (!firstRightColumnFragment) continue;
    const target = positions.get(firstRightColumnFragment.nodeId);
    if (!target) continue;
    decorations.push(
      Decoration.node(target.pos, target.pos + target.nodeSize, {
        class: 'layout-snapshot-column-break-before',
      }),
    );
  }

  const lastPage = snapshot.pages[snapshot.pages.length - 1];
  if (lastPage && snapshot.pages.length > 0) {
    const tailHeight = Math.max(0, pageContentHeight - lastPage.contentHeightPx);
    if (tailHeight > 0) {
      decorations.push(
        Decoration.widget(
          view.state.doc.content.size,
          () => createPageTailElement(tailHeight),
          {
            side: 1,
            key: 'snapshot-page-tail',
          },
        ),
      );
    }
  }

  return DecorationSet.create(view.state.doc, decorations);
}

export const SnapshotPagination = Extension.create<{
  getLayoutSnapshot: () => LayoutDocumentV2 | null;
}>({
  name: 'snapshotPagination',

  addOptions() {
    return {
      getLayoutSnapshot: () => null,
    };
  },

  addProseMirrorPlugins() {
    const getLayoutSnapshot = this.options.getLayoutSnapshot;
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(pluginKey);
            if (meta instanceof DecorationSet) return meta;
            if (tr.docChanged) return value.map(tr.mapping, newState.doc);
            return value;
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
        view: (view) => {
          let rafId = 0;
          let lastSignature = '';

          const schedule = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
              if (view.isDestroyed) return;
              const snapshot = getLayoutSnapshot();
              const signature = snapshot
                ? JSON.stringify({
                    generatedAt: snapshot.generatedAt,
                    pageCount: snapshot.pages.length,
                    fragmentCount: snapshot.fragments.length,
                    pages: snapshot.pages.map((page) => ({
                      index: page.index,
                      fragmentIds: page.fragmentIds,
                      boundaryType: page.boundaryType,
                    })),
                  })
                : 'empty';
              if (signature === lastSignature) return;
              lastSignature = signature;
              view.dispatch(view.state.tr.setMeta(pluginKey, buildSnapshotDecorationSet(view, snapshot)));
            });
          };

          schedule();

          return {
            update(nextView, prevState) {
              if (nextView.state.doc !== prevState.doc) {
                schedule();
                return;
              }
              const snapshot = getLayoutSnapshot();
              const nextSignature = snapshot ? snapshot.generatedAt : 'empty';
              if (nextSignature !== lastSignature) {
                schedule();
              }
            },
            destroy() {
              cancelAnimationFrame(rafId);
            },
          };
        },
      }),
    ];
  },
});
