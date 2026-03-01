import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { RaceBlockAttrs, RaceFeature } from './RaceBlockExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

function parseFeatures(json: string): RaceFeature[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function RaceBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as RaceBlockAttrs;
  const [editing, setEditing] = useState(false);

  const features = parseFeatures(attrs.features);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const updateFeature = useCallback(
    (idx: number, field: keyof RaceFeature, value: string) => {
      const next = features.map((f, i) =>
        i === idx ? { ...f, [field]: value } : f,
      );
      updateAttributes({ features: JSON.stringify(next) });
    },
    [features, updateAttributes],
  );

  const removeFeature = useCallback(
    (idx: number) => {
      updateAttributes({
        features: JSON.stringify(features.filter((_, i) => i !== idx)),
      });
    },
    [features, updateAttributes],
  );

  const addFeature = useCallback(() => {
    updateAttributes({
      features: JSON.stringify([
        ...features,
        { name: '', description: '' },
      ]),
    });
  }, [features, updateAttributes]);

  return (
    <NodeViewWrapper>
      <div
        className={`race-block transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete race block"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div data-drag-handle="">
          <h2 className="race-block__name">{attrs.name}</h2>
        </div>

        {/* Divider */}
        <hr className="race-block__divider" />

        {/* Traits */}
        <div className="race-block__traits">
          <div className="race-block__property">
            <span className="race-block__property-name">
              Ability Score Increase.
            </span>{' '}
            {attrs.abilityScoreIncreases}
          </div>
          <div className="race-block__property">
            <span className="race-block__property-name">Size.</span>{' '}
            {attrs.size}
          </div>
          <div className="race-block__property">
            <span className="race-block__property-name">Speed.</span>{' '}
            {attrs.speed}
          </div>
          <div className="race-block__property">
            <span className="race-block__property-name">Languages.</span>{' '}
            {attrs.languages}
          </div>
        </div>

        {/* Features */}
        {features.length > 0 && (
          <>
            <hr className="race-block__divider" />
            <div className="race-block__section-title">Racial Features</div>
            {features.map((feature, i) => (
              <div key={i} className="race-block__feature">
                <span className="race-block__feature-name">
                  {feature.name}.
                </span>{' '}
                {feature.description}
              </div>
            ))}
          </>
        )}

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div className="block-button-group">
            <AiGenerateButton
              blockType="raceBlock"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="raceBlock"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              className="block-edit-btn"
            >
              {editing ? 'Done Editing' : 'Edit Properties'}
            </button>
          </div>
        )}

        {/* Edit panel */}
        {selected && editing && (
          <div className="race-block__edit-panel">
            <h4>Race Info</h4>
            <div className="race-block__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="race-block__edit-row">
              <label>Ability Scores</label>
              <input
                value={attrs.abilityScoreIncreases}
                onChange={(e) =>
                  updateAttr('abilityScoreIncreases', e.target.value)
                }
                placeholder="e.g. +2 Dex, +1 Cha"
              />
            </div>
            <div className="race-block__edit-row">
              <label>Size</label>
              <select
                value={attrs.size}
                onChange={(e) => updateAttr('size', e.target.value)}
              >
                {['Tiny', 'Small', 'Medium', 'Large'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="race-block__edit-row">
              <label>Speed</label>
              <input
                value={attrs.speed}
                onChange={(e) => updateAttr('speed', e.target.value)}
              />
            </div>
            <div className="race-block__edit-row">
              <label>Languages</label>
              <input
                value={attrs.languages}
                onChange={(e) => updateAttr('languages', e.target.value)}
              />
            </div>

            <h4>Racial Features</h4>
            {features.map((feature, idx) => (
              <div key={idx} className="race-block__entry-item">
                <input
                  value={feature.name}
                  onChange={(e) =>
                    updateFeature(idx, 'name', e.target.value)
                  }
                  placeholder="Feature name"
                />
                <textarea
                  value={feature.description}
                  onChange={(e) =>
                    updateFeature(idx, 'description', e.target.value)
                  }
                  placeholder="Feature description"
                />
                <button
                  className="race-block__entry-remove"
                  onClick={() => removeFeature(idx)}
                  type="button"
                >
                  X
                </button>
              </div>
            ))}
            <button
              className="race-block__entry-add"
              onClick={addFeature}
              type="button"
            >
              + Add Feature
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
