import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { MagicItemAttrs } from './MagicItemExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

const ITEM_TYPES = [
  'weapon',
  'armor',
  'potion',
  'ring',
  'rod',
  'scroll',
  'staff',
  'wand',
  'wondrous',
] as const;

const RARITIES = [
  'common',
  'uncommon',
  'rare',
  'very_rare',
  'legendary',
  'artifact',
] as const;

const RARITY_COLORS: Record<string, string> = {
  common: '#6b7280',
  uncommon: '#16a34a',
  rare: '#2563eb',
  very_rare: '#7c3aed',
  legendary: '#ea580c',
  artifact: '#dc2626',
};

function rarityLabel(rarity: string): string {
  return rarity === 'very_rare' ? 'very rare' : rarity;
}

function subtitleText(attrs: MagicItemAttrs): string {
  const typeLabel = attrs.type.charAt(0).toUpperCase() + attrs.type.slice(1);
  const rarityText = rarityLabel(attrs.rarity);
  let subtitle = `${typeLabel}, ${rarityText}`;
  if (attrs.requiresAttunement) {
    subtitle += attrs.attunementRequirement
      ? ` (requires attunement ${attrs.attunementRequirement})`
      : ' (requires attunement)';
  }
  return subtitle;
}

export function MagicItemView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as MagicItemAttrs;
  const [editing, setEditing] = useState(false);

  const accentColor = RARITY_COLORS[attrs.rarity] || RARITY_COLORS.common;

  const updateAttr = useCallback(
    (key: string, value: string | number | boolean) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`magic-item transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
        style={{ borderTopColor: accentColor }}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete magic item"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div data-drag-handle="">
          <h2 className="magic-item__name" style={{ color: accentColor }}>
            {attrs.name}
          </h2>
          <div className="magic-item__subtitle">{subtitleText(attrs)}</div>
        </div>

        {/* Divider */}
        <hr
          className="magic-item__divider"
          style={{
            background: `linear-gradient(to right, ${accentColor}, transparent)`,
          }}
        />

        {/* Description */}
        <div className="magic-item__description">{attrs.description}</div>

        {/* Properties */}
        {attrs.properties && (
          <div className="magic-item__properties">{attrs.properties}</div>
        )}

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="magicItem"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="magicItem"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: accentColor,
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
          <div className="magic-item__edit-panel">
            <h4>Item Info</h4>
            <div className="magic-item__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="magic-item__edit-row">
              <label>Type</label>
              <select
                value={attrs.type}
                onChange={(e) => updateAttr('type', e.target.value)}
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="magic-item__edit-row">
              <label>Rarity</label>
              <select
                value={attrs.rarity}
                onChange={(e) => updateAttr('rarity', e.target.value)}
              >
                {RARITIES.map((r) => (
                  <option key={r} value={r}>
                    {rarityLabel(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="magic-item__edit-row">
              <label>Attunement</label>
              <input
                type="checkbox"
                checked={attrs.requiresAttunement}
                onChange={(e) =>
                  updateAttr('requiresAttunement', e.target.checked)
                }
                style={{ flex: 'none', width: 'auto' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#666' }}>
                Requires attunement
              </span>
            </div>
            {attrs.requiresAttunement && (
              <div className="magic-item__edit-row">
                <label>By whom</label>
                <input
                  value={attrs.attunementRequirement}
                  onChange={(e) =>
                    updateAttr('attunementRequirement', e.target.value)
                  }
                  placeholder="e.g. by a spellcaster"
                />
              </div>
            )}

            <h4>Description</h4>
            <textarea
              className="magic-item__edit-textarea"
              value={attrs.description}
              onChange={(e) => updateAttr('description', e.target.value)}
              placeholder="Describe the magic item..."
            />

            <h4>Properties / Special Abilities</h4>
            <textarea
              className="magic-item__edit-textarea"
              value={attrs.properties}
              onChange={(e) => updateAttr('properties', e.target.value)}
              placeholder="List special properties or abilities..."
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
