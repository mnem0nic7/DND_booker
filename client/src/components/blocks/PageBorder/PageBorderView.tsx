import { useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { PageBorderAttrs } from './PageBorderExtension';

const BORDER_OPTIONS: { value: PageBorderAttrs['borderStyle']; label: string }[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'elvish', label: 'Elvish' },
  { value: 'dwarven', label: 'Dwarven' },
  { value: 'infernal', label: 'Infernal' },
];

export function PageBorderView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as PageBorderAttrs;

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`page-border page-border--${attrs.borderStyle}${selected ? ' page-border--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete page border"
        >
          Delete
        </button>

        {/* Drag handle + border preview */}
        <div data-drag-handle="" className="page-border__drag-handle">
          <div className="page-border__preview">
            <div className="page-border__preview-inner">
              <span className="page-border__label">
                Page Border: {attrs.borderStyle.charAt(0).toUpperCase() + attrs.borderStyle.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Edit panel when selected */}
        {selected && (
          <div className="page-border__edit-panel">
            <div className="page-border__edit-row">
              <label>Border Style</label>
              <div className="page-border__style-selector">
                {BORDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`page-border__style-btn${attrs.borderStyle === opt.value ? ' page-border__style-btn--active' : ''}`}
                    onClick={() => updateAttr('borderStyle', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
