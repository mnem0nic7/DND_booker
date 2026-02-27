import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { BackCoverAttrs } from './BackCoverExtension';

export function BackCoverView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as BackCoverAttrs;
  const [editing, setEditing] = useState(false);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`back-cover${selected ? ' ring-2 ring-amber-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="back-cover__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete back cover"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="" className="back-cover__content">
          {/* Blurb */}
          <div className="back-cover__blurb">
            <p>{attrs.blurb}</p>
          </div>

          {/* Decorative divider */}
          <div className="back-cover__ornament">&#10022; &#10022; &#10022;</div>

          {/* Author section */}
          <div className="back-cover__author-section">
            {attrs.authorImageUrl ? (
              <img
                className="back-cover__author-image"
                src={attrs.authorImageUrl}
                alt="Author"
              />
            ) : (
              <div className="back-cover__author-image-placeholder">
                <span>Photo</span>
              </div>
            )}
            <p className="back-cover__author-bio">{attrs.authorBio}</p>
          </div>

          {/* Barcode placeholder */}
          <div className="back-cover__barcode-area">
            <div className="back-cover__barcode-placeholder">
              <div className="back-cover__barcode-lines">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="back-cover__barcode-line"
                    style={{ width: `${Math.random() * 2 + 1}px` }}
                  />
                ))}
              </div>
              <span className="back-cover__barcode-text">ISBN Barcode Area</span>
            </div>
          </div>
        </div>

        {/* Edit toggle */}
        {selected && (
          <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#58180d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {editing ? 'Done Editing' : 'Edit Properties'}
            </button>
          </div>
        )}

        {/* Edit panel */}
        {selected && editing && (
          <div className="back-cover__edit-panel">
            <h4>Back Cover Details</h4>
            <div className="back-cover__edit-row-col">
              <label>Blurb</label>
              <textarea
                className="back-cover__edit-textarea"
                value={attrs.blurb}
                onChange={(e) => updateAttr('blurb', e.target.value)}
                placeholder="Adventure description..."
                rows={4}
              />
            </div>
            <div className="back-cover__edit-row-col">
              <label>Author Bio</label>
              <textarea
                className="back-cover__edit-textarea"
                value={attrs.authorBio}
                onChange={(e) => updateAttr('authorBio', e.target.value)}
                placeholder="About the author..."
                rows={3}
              />
            </div>
            <div className="back-cover__edit-row">
              <label>Author Image URL</label>
              <input
                value={attrs.authorImageUrl}
                onChange={(e) => updateAttr('authorImageUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
