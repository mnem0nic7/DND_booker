import { useState, useCallback, useMemo } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { TableOfContentsAttrs } from './TableOfContentsExtension';

interface TocEntry {
  title: string;
  chapterNumber: string;
}

function extractChapterEntries(editor: ReactNodeViewProps['editor']): TocEntry[] {
  if (!editor) return [];
  const entries: TocEntry[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'chapterHeader') {
      entries.push({
        title: node.attrs.title || 'Untitled Chapter',
        chapterNumber: node.attrs.chapterNumber || '',
      });
    }
  });
  return entries;
}

export function TableOfContentsView({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: ReactNodeViewProps) {
  const attrs = node.attrs as TableOfContentsAttrs;
  const [editing, setEditing] = useState(false);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  // Re-scan chapters whenever the document changes
  const entries = useMemo(() => {
    return extractChapterEntries(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc]);

  const hasEntries = entries.length > 0;

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

        {/* Dynamic entries from chapter headers */}
        <div className="table-of-contents__entries">
          {hasEntries ? (
            entries.map((entry, i) => (
              <div key={i} className="table-of-contents__entry">
                <span className="table-of-contents__entry-title">
                  {entry.chapterNumber ? `${entry.chapterNumber}. ` : ''}
                  {entry.title}
                </span>
                <span className="table-of-contents__entry-leader" />
                <span className="table-of-contents__entry-page">&mdash;</span>
              </div>
            ))
          ) : (
            <p className="table-of-contents__note">
              Add Chapter Header blocks to populate this table of contents.
              Page numbers are generated on export.
            </p>
          )}
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
