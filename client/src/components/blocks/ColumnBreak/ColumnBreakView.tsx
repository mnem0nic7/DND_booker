import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';

export function ColumnBreakView({
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  return (
    <NodeViewWrapper>
      <div
        className={`column-break${selected ? ' column-break--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="column-break__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete column break"
        >
          Delete
        </button>

        {/* Drag handle + break indicator */}
        <div data-drag-handle="" className="column-break__drag-handle">
          <div className="column-break__line" />
          <span className="column-break__label">Column Break</span>
          <div className="column-break__line" />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
