import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { TableOfContentsAttrs } from './TableOfContentsExtension';

const PLACEHOLDER_ENTRIES = [
  { title: 'Chapter 1: Introduction', page: '1' },
  { title: 'Chapter 2: The Adventure Begins', page: '5' },
  { title: 'Chapter 3: The Dark Forest', page: '12' },
  { title: 'Chapter 4: The Final Confrontation', page: '22' },
  { title: 'Appendix A: Monsters', page: '30' },
  { title: 'Appendix B: Magic Items', page: '35' },
];

export function TableOfContentsView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as TableOfContentsAttrs;
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
        className={`table-of-contents${selected ? ' ring-2 ring-amber-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="table-of-contents__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete table of contents"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="">
          <h2 className="table-of-contents__heading">{attrs.title}</h2>
        </div>

        {/* Auto-generation note */}
        <p className="table-of-contents__note">
          Auto-generates from chapter headers on export.
        </p>

        {/* Placeholder entries */}
        <div className="table-of-contents__entries">
          {PLACEHOLDER_ENTRIES.map((entry, i) => (
            <div key={i} className="table-of-contents__entry">
              <span className="table-of-contents__entry-title">{entry.title}</span>
              <span className="table-of-contents__entry-leader" />
              <span className="table-of-contents__entry-page">{entry.page}</span>
            </div>
          ))}
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
          <div className="table-of-contents__edit-panel">
            <h4>Table of Contents Settings</h4>
            <div className="table-of-contents__edit-row">
              <label>Title</label>
              <input
                value={attrs.title}
                onChange={(e) => updateAttr('title', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
