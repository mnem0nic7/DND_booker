import { useState, useCallback, useMemo } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { TableOfContentsAttrs } from './TableOfContentsExtension';

interface TocEntry {
  level: number; // 1 = chapter header / h1, 2 = h2, 3 = h3
  title: string;
  prefix: string; // e.g. "Chapter 3" or ""
}

function extractTocEntries(editor: ReactNodeViewProps['editor']): TocEntry[] {
  if (!editor) return [];
  const entries: TocEntry[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'chapterHeader') {
      const num = String(node.attrs.chapterNumber || '');
      entries.push({
        level: 1,
        prefix: num ? `${num}.` : '',
        title: node.attrs.title || 'Untitled Chapter',
      });
    } else if (node.type.name === 'heading') {
      const level = Number(node.attrs.level ?? 2);
      if (level >= 1 && level <= 3) {
        const text = node.textContent;
        if (text) {
          entries.push({ level, prefix: '', title: text });
        }
      }
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

  // Re-scan chapters and headings whenever the document changes
  const entries = useMemo(() => {
    return extractTocEntries(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, editor?.state.doc]);

  const hasEntries = entries.length > 0;

  return (
    <NodeViewWrapper>
      <div
        className={`table-of-contents transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
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
              <div
                key={i}
                className="table-of-contents__entry"
                style={entry.level > 1 ? { paddingLeft: `${(entry.level - 1) * 1.2}rem` } : undefined}
              >
                <span className="table-of-contents__entry-title">
                  {entry.prefix ? `${entry.prefix} ` : ''}
                  {entry.title}
                </span>
                <span className="table-of-contents__entry-leader" />
                <span className="table-of-contents__entry-page">&mdash;</span>
              </div>
            ))
          ) : (
            <p className="table-of-contents__note">
              Add Chapter Header blocks or headings (H1-H3) to populate this table of contents.
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
