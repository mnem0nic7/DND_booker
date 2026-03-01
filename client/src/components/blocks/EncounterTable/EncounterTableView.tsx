import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type {
  EncounterTableAttrs,
  EncounterEntry,
} from './EncounterTableExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

function parseEntries(json: string): EncounterEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function EncounterTableView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as EncounterTableAttrs;
  const [editing, setEditing] = useState(false);

  const entries = parseEntries(attrs.entries);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const updateEntry = useCallback(
    (idx: number, field: keyof EncounterEntry, value: string | number) => {
      const next = entries.map((e, i) =>
        i === idx ? { ...e, [field]: value } : e,
      );
      updateAttributes({ entries: JSON.stringify(next) });
    },
    [entries, updateAttributes],
  );

  const removeEntry = useCallback(
    (idx: number) => {
      updateAttributes({
        entries: JSON.stringify(entries.filter((_, i) => i !== idx)),
      });
    },
    [entries, updateAttributes],
  );

  const addEntry = useCallback(() => {
    updateAttributes({
      entries: JSON.stringify([
        ...entries,
        { weight: 1, description: '', cr: '0' },
      ]),
    });
  }, [entries, updateAttributes]);

  return (
    <NodeViewWrapper>
      <div
        className={`encounter-table transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete encounter table"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div className="encounter-table__header" data-drag-handle="">
          <h2 className="encounter-table__title">
            {attrs.environment} Encounters
          </h2>
          <div className="encounter-table__cr-range">
            CR Range: {attrs.crRange}
          </div>
        </div>

        {/* Table */}
        <table className="encounter-table__table">
          <thead>
            <tr>
              <th className="encounter-table__th">d{entries.reduce((s, e) => s + e.weight, 0)}</th>
              <th className="encounter-table__th">Encounter</th>
              <th className="encounter-table__th">CR</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              let running = 0;
              return entries.map((entry, i) => {
                const from = running + 1;
                running += entry.weight;
                const to = running;
                const rangeLabel =
                  from === to ? `${from}` : `${from}\u2013${to}`;
                return (
                  <tr key={i} className="encounter-table__row">
                    <td className="encounter-table__td encounter-table__td--weight">
                      {rangeLabel}
                    </td>
                    <td className="encounter-table__td">
                      {entry.description}
                    </td>
                    <td className="encounter-table__td encounter-table__td--cr">
                      {entry.cr}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="encounterTable"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="encounterTable"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#1a5c2e',
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
          <div className="encounter-table__edit-panel">
            <h4>Table Info</h4>
            <div className="encounter-table__edit-row">
              <label>Environment</label>
              <input
                value={attrs.environment}
                onChange={(e) => updateAttr('environment', e.target.value)}
              />
            </div>
            <div className="encounter-table__edit-row">
              <label>CR Range</label>
              <input
                value={attrs.crRange}
                onChange={(e) => updateAttr('crRange', e.target.value)}
                placeholder="e.g. 1-4"
              />
            </div>

            <h4>Entries</h4>
            {entries.map((entry, idx) => (
              <div key={idx} className="encounter-table__entry-item">
                <input
                  type="number"
                  value={entry.weight}
                  onChange={(e) =>
                    updateEntry(idx, 'weight', Number(e.target.value))
                  }
                  min={1}
                  style={{ width: '3rem' }}
                  title="Weight"
                />
                <input
                  value={entry.description}
                  onChange={(e) =>
                    updateEntry(idx, 'description', e.target.value)
                  }
                  placeholder="Encounter description"
                  style={{ flex: 1 }}
                />
                <input
                  value={entry.cr}
                  onChange={(e) => updateEntry(idx, 'cr', e.target.value)}
                  placeholder="CR"
                  style={{ width: '3rem' }}
                />
                <button
                  className="encounter-table__entry-remove"
                  onClick={() => removeEntry(idx)}
                  type="button"
                >
                  X
                </button>
              </div>
            ))}
            <button
              className="encounter-table__entry-add"
              onClick={addEntry}
              type="button"
            >
              + Add Entry
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
