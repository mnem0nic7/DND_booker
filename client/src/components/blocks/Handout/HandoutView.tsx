import { useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { HandoutAttrs } from './HandoutExtension';

const STYLE_OPTIONS: { value: HandoutAttrs['style']; label: string }[] = [
  { value: 'letter', label: 'Letter' },
  { value: 'scroll', label: 'Scroll' },
  { value: 'poster', label: 'Poster' },
];

export function HandoutView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as HandoutAttrs;

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`handout handout--${attrs.style}${selected ? ' handout--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="handout__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete handout"
        >
          Delete
        </button>

        {/* Drag handle + handout content */}
        <div data-drag-handle="" className="handout__drag-handle">
          {/* Title */}
          <div className="handout__title">{attrs.title}</div>

          {/* Content area */}
          <div className="handout__content">
            {attrs.content || (
              <span className="handout__content-placeholder">
                Handout content goes here...
              </span>
            )}
          </div>
        </div>

        {/* Edit panel when selected */}
        {selected && (
          <div className="handout__edit-panel">
            <div className="handout__edit-row">
              <label>Title</label>
              <input
                value={attrs.title}
                onChange={(e) => updateAttr('title', e.target.value)}
                placeholder="Handout title"
              />
            </div>
            <div className="handout__edit-row">
              <label>Style</label>
              <div className="handout__style-selector">
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`handout__style-btn${attrs.style === opt.value ? ' handout__style-btn--active' : ''}`}
                    onClick={() => updateAttr('style', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="handout__edit-row handout__edit-row--full">
              <label>Content</label>
              <textarea
                value={attrs.content}
                onChange={(e) => updateAttr('content', e.target.value)}
                placeholder="Write the handout content..."
                rows={6}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
