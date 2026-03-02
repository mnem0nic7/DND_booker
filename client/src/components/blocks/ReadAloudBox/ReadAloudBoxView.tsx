import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { ReadAloudBoxStyle } from './ReadAloudBoxExtension';

export function ReadAloudBoxView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const style = node.attrs.style as ReadAloudBoxStyle;

  const toggleStyle = () => {
    updateAttributes({ style: style === 'parchment' ? 'dark' : 'parchment' });
  };

  return (
    <NodeViewWrapper>
      <div
        className={`read-aloud-box read-aloud-box--${style}${selected ? ' read-aloud-box--selected' : ''}`}
      >
        {/* Header with drag handle */}
        <div className="read-aloud-box__header" data-drag-handle="">
          <span className="read-aloud-box__label">Read Aloud</span>
          <div className="read-aloud-box__controls">
            <button
              className="read-aloud-box__style-btn"
              onClick={toggleStyle}
              type="button"
              title={`Switch to ${style === 'parchment' ? 'dark' : 'parchment'} style`}
              contentEditable={false}
            >
              {style === 'parchment' ? 'Dark' : 'Parchment'}
            </button>
            <button
              className="read-aloud-box__delete-btn-inline"
              onClick={deleteNode}
              type="button"
              title="Delete read-aloud box"
              contentEditable={false}
            >
              Delete
            </button>
          </div>
        </div>

        {/* Editable content area */}
        <NodeViewContent className="read-aloud-box__content" />
      </div>
    </NodeViewWrapper>
  );
}
