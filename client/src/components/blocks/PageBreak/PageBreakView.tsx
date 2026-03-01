import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';

export function PageBreakView({
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  return (
    <NodeViewWrapper>
      <div
        className={`page-break${selected ? ' page-break--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete page break"
        >
          Delete
        </button>

        {/* Drag handle + break indicator */}
        <div data-drag-handle="" className="page-break__drag-handle">
          <div className="page-break__line" />
          <span className="page-break__label">Page Break</span>
          <div className="page-break__line" />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
