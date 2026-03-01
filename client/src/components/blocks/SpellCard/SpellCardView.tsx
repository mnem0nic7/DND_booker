import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { SpellCardAttrs } from './SpellCardExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

const SCHOOLS = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const;

function levelLabel(level: number, school: string): string {
  if (level === 0) return `${school} cantrip`;
  const suffix =
    level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix}-level ${school}`;
}

export function SpellCardView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as SpellCardAttrs;
  const [editing, setEditing] = useState(false);

  const updateAttr = useCallback(
    (key: string, value: string | number) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`spell-card transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete spell card"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div data-drag-handle="">
          <h2 className="spell-card__name">{attrs.name}</h2>
          <div className="spell-card__subtitle">
            {levelLabel(attrs.level, attrs.school)}
          </div>
        </div>

        {/* Divider */}
        <hr className="spell-card__divider" />

        {/* Properties */}
        <div className="spell-card__property">
          <span className="spell-card__property-name">Casting Time</span>{' '}
          {attrs.castingTime}
        </div>
        <div className="spell-card__property">
          <span className="spell-card__property-name">Range</span>{' '}
          {attrs.range}
        </div>
        <div className="spell-card__property">
          <span className="spell-card__property-name">Components</span>{' '}
          {attrs.components}
        </div>
        <div className="spell-card__property">
          <span className="spell-card__property-name">Duration</span>{' '}
          {attrs.duration}
        </div>

        {/* Divider */}
        <hr className="spell-card__divider" />

        {/* Description */}
        <div className="spell-card__description">{attrs.description}</div>

        {/* At Higher Levels */}
        {attrs.higherLevels && (
          <div className="spell-card__higher-levels">
            <span className="spell-card__higher-levels-label">
              At Higher Levels.
            </span>{' '}
            {attrs.higherLevels}
          </div>
        )}

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="spellCard"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="spellCard"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#4338ca',
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
          <div className="spell-card__edit-panel">
            <h4>Spell Info</h4>
            <div className="spell-card__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="spell-card__edit-row">
              <label>Level</label>
              <select
                value={attrs.level}
                onChange={(e) => updateAttr('level', Number(e.target.value))}
              >
                <option value={0}>Cantrip</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="spell-card__edit-row">
              <label>School</label>
              <select
                value={attrs.school}
                onChange={(e) => updateAttr('school', e.target.value)}
              >
                {SCHOOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <h4>Properties</h4>
            <div className="spell-card__edit-row">
              <label>Casting Time</label>
              <input
                value={attrs.castingTime}
                onChange={(e) => updateAttr('castingTime', e.target.value)}
              />
            </div>
            <div className="spell-card__edit-row">
              <label>Range</label>
              <input
                value={attrs.range}
                onChange={(e) => updateAttr('range', e.target.value)}
              />
            </div>
            <div className="spell-card__edit-row">
              <label>Components</label>
              <input
                value={attrs.components}
                onChange={(e) => updateAttr('components', e.target.value)}
              />
            </div>
            <div className="spell-card__edit-row">
              <label>Duration</label>
              <input
                value={attrs.duration}
                onChange={(e) => updateAttr('duration', e.target.value)}
              />
            </div>

            <h4>Description</h4>
            <textarea
              className="spell-card__edit-textarea"
              value={attrs.description}
              onChange={(e) => updateAttr('description', e.target.value)}
              placeholder="Describe the spell effect..."
            />

            <h4>At Higher Levels</h4>
            <textarea
              className="spell-card__edit-textarea"
              value={attrs.higherLevels}
              onChange={(e) => updateAttr('higherLevels', e.target.value)}
              placeholder="Optional: When you cast this spell using a spell slot of..."
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
