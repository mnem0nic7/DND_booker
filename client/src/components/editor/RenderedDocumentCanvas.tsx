import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import {
  getCanonicalLayoutCss,
  renderContentWithLayoutPlan,
  type DocumentContent,
  type LayoutPlan,
} from '@dnd-booker/shared';

type DropPlacement = 'before' | 'after';

interface RenderedDocumentCanvasProps {
  editor: Editor | null;
  theme: string;
  layoutPlan?: LayoutPlan | null;
  documentKind?: string | null;
  documentTitle?: string | null;
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
  layoutPlan = null,
  documentKind = null,
  documentTitle = null,
  selectedNodeId,
  onSelectNodeId,
  onReorderNode,
}: RenderedDocumentCanvasProps) {
  const [html, setHtml] = useState('');
  const [dropTarget, setDropTarget] = useState<DropTargetState | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateHtml = useCallback(() => {
    if (!editor) return;
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
  }, [documentKind, documentTitle, editor, layoutPlan]);

  useEffect(() => {
    if (!editor) return;
    updateHtml();
    editor.on('update', updateHtml);
    return () => {
      editor.off('update', updateHtml);
    };
  }, [editor, updateHtml]);

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
  }, [dropTarget, html, selectedNodeId]);

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
      __html: `<div class="ProseMirror">${html}</div>`,
    }),
    [html],
  );

  return (
    <div className="editor-outer parity-editor-outer" data-theme={theme}>
      <style>{getCanonicalLayoutCss()}</style>
      <div className="page-canvas editor-themed-content parity-page-canvas">
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
        <div className="page-footer">
          <span>{documentTitle ?? ''}</span>
          <span>{documentKind === 'chapter' ? 'Layout Canvas' : ''}</span>
        </div>
      </div>
    </div>
  );
}
