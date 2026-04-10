import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { EditorContent, type Editor } from '@tiptap/react';
import {
  getCanonicalLayoutCss,
} from '@dnd-booker/shared';
import type { MeasuredLayoutDocumentResult } from '../../lib/useMeasuredLayoutDocument';

type DropPlacement = 'before' | 'after';

function resolvePageHeightPx(pageSize: 'letter' | 'a4' | 'a5', layoutSnapshot: MeasuredLayoutDocumentResult['layoutSnapshot']): number {
  const snapshotHeight = layoutSnapshot?.measureProfile.frame.pageHeightPx;
  if (typeof snapshotHeight === 'number' && Number.isFinite(snapshotHeight) && snapshotHeight > 0) {
    return snapshotHeight;
  }

  switch (pageSize) {
    case 'a4':
      return 1123;
    case 'a5':
      return 794;
    case 'letter':
    default:
      return 1056;
  }
}

interface RenderedDocumentCanvasProps {
  editor: Editor | null;
  theme: string;
  measuredDocument: MeasuredLayoutDocumentResult;
  pageSize: 'letter' | 'a4' | 'a5';
  columnCount: 1 | 2;
  showTexture: boolean;
  selectedNodeId: string | null;
  onSelectNodeId: (nodeId: string) => void;
  onReorderNode: (draggedNodeId: string, targetNodeId: string, placement: DropPlacement) => void;
}

interface DropTargetState {
  nodeId: string;
  placement: DropPlacement;
}

export function RenderedDocumentCanvas({
  editor,
  theme,
  measuredDocument,
  pageSize,
  columnCount,
  showTexture,
  selectedNodeId,
  onSelectNodeId,
  onReorderNode,
}: RenderedDocumentCanvasProps) {
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { layoutSnapshot, measurementHtml, measurementRef } = measuredDocument;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll<HTMLElement>('.ProseMirror > [data-node-id]').forEach((element) => {
      element.classList.remove('layout-editor-selected', 'layout-editor-drop-before', 'layout-editor-drop-after');
      if (selectedNodeId && element.dataset.nodeId === selectedNodeId) {
        element.classList.add('layout-editor-selected');
      }
      if (dropTarget && element.dataset.nodeId === dropTarget.nodeId) {
        element.classList.add(dropTarget.placement === 'before' ? 'layout-editor-drop-before' : 'layout-editor-drop-after');
      }
      element.setAttribute('draggable', 'true');
    });
  }, [dropTarget, editor?.state.doc, selectedNodeId]);

  const getDropPlacement = (event: DragEvent<HTMLElement>, element: HTMLElement): DropPlacement => {
    const rect = element.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const handleNodeClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>('[data-node-id]');
    const nodeId = nodeElement?.dataset.nodeId;
    if (!nodeId) return;
    if (nodeElement?.isContentEditable) return;
    onSelectNodeId(nodeId);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>('[data-node-id]');
    const nodeId = nodeElement?.dataset.nodeId;
    if (!nodeId) return;

    draggedNodeIdRef.current = nodeId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    onSelectNodeId(nodeId);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>('[data-node-id]');
    const draggedNodeId = draggedNodeIdRef.current;
    const nodeId = nodeElement?.dataset.nodeId;
    if (!nodeId || !draggedNodeId || draggedNodeId === nodeId) {
      setDropTarget(null);
      return;
    }

    event.preventDefault();
    const placement = getDropPlacement(event, nodeElement);
    setDropTarget({ nodeId, placement });
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && containerRef.current?.contains(relatedTarget)) {
      return;
    }
    setDropTarget(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>('[data-node-id]');
    const draggedNodeId = draggedNodeIdRef.current;
    const targetNodeId = nodeElement?.dataset.nodeId;
    if (!draggedNodeId || !targetNodeId || draggedNodeId === targetNodeId) {
      setDropTarget(null);
      draggedNodeIdRef.current = null;
      return;
    }

    const placement = getDropPlacement(event, nodeElement);
    onReorderNode(draggedNodeId, targetNodeId, placement);
    setDropTarget(null);
    draggedNodeIdRef.current = null;
  };

  const handleDragEnd = () => {
    setDropTarget(null);
    draggedNodeIdRef.current = null;
  };

  const measurementMarkup = useMemo(
    () => ({
      __html: measurementHtml,
    }),
    [measurementHtml],
  );

  const pageCount = Math.max(1, layoutSnapshot?.pages.length ?? 1);
  const pageHeight = resolvePageHeightPx(pageSize, layoutSnapshot);
  const pageGap = 32;
  const totalHeight = (pageCount * pageHeight) + (Math.max(0, pageCount - 1) * pageGap);

  return (
    <div className="editor-outer parity-editor-outer relative" data-theme={theme}>
      <style>{getCanonicalLayoutCss()}</style>
      <div className="parity-measure-host" aria-hidden="true">
        <div className="page-canvas editor-themed-content parity-measure-canvas" data-theme={theme}>
          <div
            ref={measurementRef}
            className="ProseMirror parity-measure-flow"
            dangerouslySetInnerHTML={measurementMarkup}
          />
        </div>
      </div>
      <div
        className="editor-themed-content parity-page-canvas"
        data-page-size={pageSize}
        data-columns={columnCount}
        data-texture-off={showTexture ? undefined : ''}
      >
        <div
          ref={containerRef}
          className="parity-live-canvas"
          data-page-size={pageSize}
          data-columns={columnCount}
          data-texture-off={showTexture ? undefined : ''}
          onClick={handleNodeClick}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
        >
          <div className="parity-live-page-stack" aria-hidden="true">
            {Array.from({ length: pageCount }, (_entry, index) => (
              <div
                key={`page-bg-${index + 1}`}
                className="parity-live-page-bg"
                style={{ top: `${index * (pageHeight + pageGap)}px` }}
              />
            ))}
          </div>
          <div
            className="parity-live-editor-shell"
            style={{ minHeight: `${totalHeight}px` }}
          >
            {editor && <EditorContent editor={editor} className="parity-live-editor-content" />}
          </div>
        </div>
      </div>
    </div>
  );
}
