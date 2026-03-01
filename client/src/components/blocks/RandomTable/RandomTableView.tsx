import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { RandomTableAttrs, RandomTableEntry } from './RandomTableExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;

function parseEntries(json: string): RandomTableEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function RandomTableView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as RandomTableAttrs;
  const [editing, setEditing] = useState(false);

  const entries = parseEntries(attrs.entries);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const updateEntry = useCallback(
    (idx: number, field: keyof RandomTableEntry, value: string) => {
      const next = entries.map((e, i) =>
        i === idx ? { ...e, [field]: value } : e,
      );
      updateAttributes({ entries: JSON.stringify(next) });
    },
    [entries, updateAttributes],
  );

  const removeEntry = useCallback(
    (idx: number) => {
      const next = entries.filter((_, i) => i !== idx);
      updateAttributes({ entries: JSON.stringify(next) });
    },
    [entries, updateAttributes],
  );

  const addEntry = useCallback(() => {
    const next = [...entries, { roll: String(entries.length + 1), result: '' }];
    updateAttributes({ entries: JSON.stringify(next) });
  }, [entries, updateAttributes]);

  return (
    <NodeViewWrapper>
      <div
        className={`random-table transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete random table"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div className="random-table__header" data-drag-handle="">
          <h2 className="random-table__title">{attrs.title}</h2>
          <span className="random-table__die-badge">{attrs.dieType}</span>
        </div>

        {/* Table */}
        <table className="random-table__table">
          <thead>
            <tr>
              <th className="random-table__th random-table__th--roll">
                {attrs.dieType}
              </th>
              <th className="random-table__th">Result</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, idx) => (
              <tr key={idx} className="random-table__row">
                <td className="random-table__td random-table__td--roll">
                  {entry.roll}
                </td>
                <td className="random-table__td">{entry.result}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="randomTable"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="randomTable"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#78350f',
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
          <div className="random-table__edit-panel">
            <h4>Table Info</h4>
            <div className="random-table__edit-row">
              <label>Title</label>
              <input
                value={attrs.title}
                onChange={(e) => updateAttr('title', e.target.value)}
              />
            </div>
            <div className="random-table__edit-row">
              <label>Die Type</label>
              <select
                value={attrs.dieType}
                onChange={(e) => updateAttr('dieType', e.target.value)}
              >
                {DIE_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <h4>Entries</h4>
            <div className="random-table__entry-list">
              {entries.map((entry, idx) => (
                <div key={idx} className="random-table__entry-item">
                  <input
                    className="random-table__entry-roll"
                    value={entry.roll}
                    onChange={(e) => updateEntry(idx, 'roll', e.target.value)}
                    placeholder="Roll"
                  />
                  <input
                    className="random-table__entry-result"
                    value={entry.result}
                    onChange={(e) => updateEntry(idx, 'result', e.target.value)}
                    placeholder="Result"
                  />
                  <button
                    className="random-table__entry-remove"
                    onClick={() => removeEntry(idx)}
                    type="button"
                  >
                    X
                  </button>
                </div>
              ))}
              <button
                className="random-table__entry-add"
                onClick={addEntry}
                type="button"
              >
                + Add Entry
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
