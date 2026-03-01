import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { MapBlockAttrs } from './MapBlockExtension';
import { ImageUploader } from '../../editor/ImageUploader';

interface KeyEntry {
  label: string;
  description: string;
}

function parseKeyEntries(json: string): KeyEntry[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function MapBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as MapBlockAttrs;
  const keyEntries = parseKeyEntries(attrs.keyEntries);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const updateKeyEntry = (idx: number, field: keyof KeyEntry, value: string) => {
    const next = keyEntries.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e,
    );
    updateAttr('keyEntries', JSON.stringify(next));
  };

  const removeKeyEntry = (idx: number) => {
    updateAttr('keyEntries', JSON.stringify(keyEntries.filter((_, i) => i !== idx)));
  };

  const addKeyEntry = () => {
    updateAttr('keyEntries', JSON.stringify([...keyEntries, { label: '', description: '' }]));
  };

  return (
    <NodeViewWrapper>
      <div
        className={`map-block${selected ? ' map-block--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete map block"
        >
          Delete
        </button>

        {/* Drag handle + map area */}
        <div data-drag-handle="" className="map-block__drag-handle">
          <div className="map-block__image-area">
            {attrs.src ? (
              <img
                className="map-block__img"
                src={attrs.src}
                alt="Map"
              />
            ) : (
              <div className="map-block__placeholder">
                <span className="map-block__placeholder-icon">&#128506;</span>
                <span className="map-block__placeholder-text">No map image set</span>
              </div>
            )}
          </div>
        </div>

        {/* Scale indicator */}
        {attrs.scale && (
          <div className="map-block__scale">
            <span className="map-block__scale-label">Scale:</span> {attrs.scale}
          </div>
        )}

        {/* Legend / Key entries */}
        {keyEntries.length > 0 && (
          <div className="map-block__legend">
            <div className="map-block__legend-title">Map Key</div>
            {keyEntries.map((entry, i) => (
              <div key={i} className="map-block__legend-entry">
                <span className="map-block__legend-label">{entry.label}.</span>{' '}
                {entry.description}
              </div>
            ))}
          </div>
        )}

        {/* Edit panel when selected */}
        {selected && (
          <div className="map-block__edit-panel">
            <div className="map-block__edit-row">
              <label>Map Image</label>
              {projectId && (
                <ImageUploader
                  projectId={projectId}
                  onUpload={(url) => updateAttr('src', url)}
                  className="mb-2"
                />
              )}
              <input
                value={attrs.src}
                onChange={(e) => updateAttr('src', e.target.value)}
                placeholder="Or enter image URL"
              />
            </div>
            <div className="map-block__edit-row">
              <label>Scale</label>
              <input
                value={attrs.scale}
                onChange={(e) => updateAttr('scale', e.target.value)}
                placeholder="e.g. 1 inch = 5 feet"
              />
            </div>
            <h4 style={{ margin: '0.5rem 0 0.25rem', fontSize: '0.8rem' }}>Key Entries</h4>
            {keyEntries.map((entry, idx) => (
              <div key={idx} className="map-block__edit-entry">
                <input
                  value={entry.label}
                  onChange={(e) => updateKeyEntry(idx, 'label', e.target.value)}
                  placeholder="Label (e.g. A)"
                  style={{ width: '3rem' }}
                />
                <input
                  value={entry.description}
                  onChange={(e) => updateKeyEntry(idx, 'description', e.target.value)}
                  placeholder="Description"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => removeKeyEntry(idx)}
                  style={{ color: '#dc2626', cursor: 'pointer', border: 'none', background: 'none', fontWeight: 'bold' }}
                >
                  X
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addKeyEntry}
              className="map-block__add-entry-btn"
            >
              + Add Key Entry
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
