import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  getCanonicalLayoutCss,
} from '@dnd-booker/shared';
import type { MeasuredLayoutDocumentResult } from '../../lib/useMeasuredLayoutDocument';

type DropPlacement = 'before' | 'after';

interface RenderedDocumentCanvasProps {
  theme: string;
  measuredDocument: MeasuredLayoutDocumentResult;
  selectedNodeId: string | null;
  onSelectNodeId: (nodeId: string) => void;
  onReorderNode: (draggedNodeId: string, targetNodeId: string, placement: DropPlacement) => void;
}

interface DropTargetState {
  nodeId: string;
  placement: DropPlacement;
}

export function RenderedDocumentCanvas({
  theme,
  measuredDocument,
  selectedNodeId,
  onSelectNodeId,
  onReorderNode,
}: RenderedDocumentCanvasProps) {
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { measurementHtml, renderedHtml, measurementRef } = measuredDocument;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll<HTMLElement>('[data-node-id]').forEach((element) => {
      element.classList.remove('layout-editor-selected', 'layout-editor-drop-before', 'layout-editor-drop-after');
      if (selectedNodeId && element.dataset.nodeId === selectedNodeId) {
        element.classList.add('layout-editor-selected');
      }
      if (dropTarget && element.dataset.nodeId === dropTarget.nodeId) {
        element.classList.add(dropTarget.placement === 'before' ? 'layout-editor-drop-before' : 'layout-editor-drop-after');
      }
    });
  }, [dropTarget, renderedHtml, selectedNodeId]);

  const getDropPlacement = (event: DragEvent<HTMLElement>, element: HTMLElement): DropPlacement => {
    const rect = element.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  };

  const handleNodeClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const nodeElement = target?.closest<HTMLElement>('[data-node-id]');
    const nodeId = nodeElement?.dataset.nodeId;
    if (!nodeId) return;
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

  const canvasHtml = useMemo(
    () => ({
      __html: renderedHtml,
    }),
    [renderedHtml],
  );

  const measurementMarkup = useMemo(
    () => ({
      __html: measurementHtml,
    }),
    [measurementHtml],
  );

  return (
    <div className="editor-outer parity-editor-outer relative" data-theme={theme}>
      <style>{getCanonicalLayoutCss()}</style>
      <div className="parity-measure-host" aria-hidden="true">
        <div ref={measurementRef} className="page-canvas editor-themed-content parity-measure-canvas" data-theme={theme} dangerouslySetInnerHTML={measurementMarkup} />
      </div>
      <div className="editor-themed-content parity-page-canvas">
        <div
          ref={containerRef}
          className="parity-render-surface"
          onClick={handleNodeClick}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          dangerouslySetInnerHTML={canvasHtml}
        />
      </div>
    </div>
  );
}
