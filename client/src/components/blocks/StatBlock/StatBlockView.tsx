import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { StatBlockAttrs } from './StatBlockExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

interface NameDesc {
  name: string;
  description: string;
}

function getModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function parseEntries(json: string): NameDesc[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Editable list of {name, description} entries (traits, actions, etc.) */
function EntryListEditor({
  entries,
  onChange,
  addLabel,
}: {
  entries: NameDesc[];
  onChange: (entries: NameDesc[]) => void;
  addLabel: string;
}) {
  const update = (idx: number, field: keyof NameDesc, value: string) => {
    const next = entries.map((e, i) =>
      i === idx ? { ...e, [field]: value } : e,
    );
    onChange(next);
  };

  const remove = (idx: number) => {
    onChange(entries.filter((_, i) => i !== idx));
  };

  const add = () => {
    onChange([...entries, { name: '', description: '' }]);
  };

  return (
    <div className="stat-block__entry-list">
      {entries.map((entry, idx) => (
        <div key={idx} className="stat-block__entry-item">
          <input
            value={entry.name}
            onChange={(e) => update(idx, 'name', e.target.value)}
            placeholder="Name"
          />
          <textarea
            value={entry.description}
            onChange={(e) => update(idx, 'description', e.target.value)}
            placeholder="Description"
          />
          <button
            className="stat-block__entry-remove"
            onClick={() => remove(idx)}
            type="button"
          >
            X
          </button>
        </div>
      ))}
      <button className="stat-block__entry-add" onClick={add} type="button">
        + {addLabel}
      </button>
    </div>
  );
}

export function StatBlockView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as StatBlockAttrs;
  const [editing, setEditing] = useState(false);

  const traits = parseEntries(attrs.traits);
  const actions = parseEntries(attrs.actions);
  const reactions = parseEntries(attrs.reactions);
  const legendaryActions = parseEntries(attrs.legendaryActions);

  const updateAttr = useCallback(
    (key: string, value: string | number) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const abilityNames = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const abilityLabels = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

  return (
    <NodeViewWrapper>
      <div
        className={`stat-block${selected ? ' ring-2 ring-amber-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="stat-block__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete stat block"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div data-drag-handle="">
          <h2 className="stat-block__name">{attrs.name}</h2>
          <div className="stat-block__subtitle">
            {attrs.size} {attrs.type}, {attrs.alignment}
          </div>
        </div>

        {/* Divider */}
        <hr className="stat-block__divider" />

        {/* Core stats */}
        <div className="stat-block__property">
          <span className="stat-block__property-name">Armor Class</span>{' '}
          {attrs.ac}
          {attrs.acType ? ` (${attrs.acType})` : ''}
        </div>
        <div className="stat-block__property">
          <span className="stat-block__property-name">Hit Points</span>{' '}
          {attrs.hp}
          {attrs.hitDice ? ` (${attrs.hitDice})` : ''}
        </div>
        <div className="stat-block__property">
          <span className="stat-block__property-name">Speed</span> {attrs.speed}
        </div>

        {/* Divider */}
        <hr className="stat-block__divider" />

        {/* Ability scores */}
        <div className="stat-block__abilities">
          {abilityNames.map((key, i) => {
            const score = attrs[key] as number;
            return (
              <div key={key} className="stat-block__ability">
                <div className="stat-block__ability-name">
                  {abilityLabels[i]}
                </div>
                <div className="stat-block__ability-score">
                  {score} ({getModifier(score)})
                </div>
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <hr className="stat-block__divider" />

        {/* Optional properties */}
        {attrs.savingThrows && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">Saving Throws</span>{' '}
            {attrs.savingThrows}
          </div>
        )}
        {attrs.skills && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">Skills</span>{' '}
            {attrs.skills}
          </div>
        )}
        {attrs.damageResistances && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">
              Damage Resistances
            </span>{' '}
            {attrs.damageResistances}
          </div>
        )}
        {attrs.damageImmunities && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">
              Damage Immunities
            </span>{' '}
            {attrs.damageImmunities}
          </div>
        )}
        {attrs.conditionImmunities && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">
              Condition Immunities
            </span>{' '}
            {attrs.conditionImmunities}
          </div>
        )}
        {attrs.senses && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">Senses</span>{' '}
            {attrs.senses}
          </div>
        )}
        {attrs.languages && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">Languages</span>{' '}
            {attrs.languages}
          </div>
        )}
        {(attrs.cr || attrs.xp) && (
          <div className="stat-block__property">
            <span className="stat-block__property-name">Challenge</span>{' '}
            {attrs.cr}
            {attrs.xp ? ` (${attrs.xp} XP)` : ''}
          </div>
        )}

        {/* Divider before traits */}
        {traits.length > 0 && <hr className="stat-block__divider" />}

        {/* Traits */}
        {traits.map((trait, i) => (
          <div key={i} className="stat-block__trait">
            <span className="stat-block__trait-name">{trait.name}.</span>{' '}
            {trait.description}
          </div>
        ))}

        {/* Actions */}
        {actions.length > 0 && (
          <>
            <div className="stat-block__section-title">Actions</div>
            {actions.map((action, i) => (
              <div key={i} className="stat-block__trait">
                <span className="stat-block__trait-name">{action.name}.</span>{' '}
                {action.description}
              </div>
            ))}
          </>
        )}

        {/* Reactions */}
        {reactions.length > 0 && (
          <>
            <div className="stat-block__section-title">Reactions</div>
            {reactions.map((reaction, i) => (
              <div key={i} className="stat-block__trait">
                <span className="stat-block__trait-name">
                  {reaction.name}.
                </span>{' '}
                {reaction.description}
              </div>
            ))}
          </>
        )}

        {/* Legendary Actions */}
        {legendaryActions.length > 0 && (
          <>
            <div className="stat-block__section-title">Legendary Actions</div>
            {attrs.legendaryDescription && (
              <div className="stat-block__trait">
                {attrs.legendaryDescription}
              </div>
            )}
            {legendaryActions.map((la, i) => (
              <div key={i} className="stat-block__trait">
                <span className="stat-block__trait-name">{la.name}.</span>{' '}
                {la.description}
              </div>
            ))}
          </>
        )}

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="statBlock"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="statBlock"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
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
          <div className="stat-block__edit-panel">
            {/* Basic info */}
            <h4>Basic Info</h4>
            <div className="stat-block__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Size</label>
              <select
                value={attrs.size}
                onChange={(e) => updateAttr('size', e.target.value)}
              >
                {[
                  'Tiny',
                  'Small',
                  'Medium',
                  'Large',
                  'Huge',
                  'Gargantuan',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="stat-block__edit-row">
              <label>Type</label>
              <input
                value={attrs.type}
                onChange={(e) => updateAttr('type', e.target.value)}
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Alignment</label>
              <input
                value={attrs.alignment}
                onChange={(e) => updateAttr('alignment', e.target.value)}
              />
            </div>

            {/* Combat stats */}
            <h4>Combat Stats</h4>
            <div className="stat-block__edit-row">
              <label>AC</label>
              <input
                type="number"
                value={attrs.ac}
                onChange={(e) => updateAttr('ac', Number(e.target.value))}
              />
              <label>Type</label>
              <input
                value={attrs.acType}
                onChange={(e) => updateAttr('acType', e.target.value)}
                placeholder="e.g. natural armor"
              />
            </div>
            <div className="stat-block__edit-row">
              <label>HP</label>
              <input
                type="number"
                value={attrs.hp}
                onChange={(e) => updateAttr('hp', Number(e.target.value))}
              />
              <label>Hit Dice</label>
              <input
                value={attrs.hitDice}
                onChange={(e) => updateAttr('hitDice', e.target.value)}
                placeholder="e.g. 2d8+2"
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Speed</label>
              <input
                value={attrs.speed}
                onChange={(e) => updateAttr('speed', e.target.value)}
              />
            </div>

            {/* Ability scores */}
            <h4>Ability Scores</h4>
            <div className="stat-block__edit-abilities">
              {abilityNames.map((key, i) => (
                <div key={key} className="stat-block__edit-ability">
                  <label>{abilityLabels[i]}</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={attrs[key] as number}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                      updateAttr(key, v);
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Properties */}
            <h4>Properties</h4>
            <div className="stat-block__edit-row">
              <label>Saving Throws</label>
              <input
                value={attrs.savingThrows}
                onChange={(e) => updateAttr('savingThrows', e.target.value)}
                placeholder="e.g. Dex +5, Wis +3"
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Skills</label>
              <input
                value={attrs.skills}
                onChange={(e) => updateAttr('skills', e.target.value)}
                placeholder="e.g. Perception +5, Stealth +7"
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Dmg Resist.</label>
              <input
                value={attrs.damageResistances}
                onChange={(e) =>
                  updateAttr('damageResistances', e.target.value)
                }
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Dmg Immun.</label>
              <input
                value={attrs.damageImmunities}
                onChange={(e) =>
                  updateAttr('damageImmunities', e.target.value)
                }
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Cond. Immun.</label>
              <input
                value={attrs.conditionImmunities}
                onChange={(e) =>
                  updateAttr('conditionImmunities', e.target.value)
                }
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Senses</label>
              <input
                value={attrs.senses}
                onChange={(e) => updateAttr('senses', e.target.value)}
              />
            </div>
            <div className="stat-block__edit-row">
              <label>Languages</label>
              <input
                value={attrs.languages}
                onChange={(e) => updateAttr('languages', e.target.value)}
              />
            </div>
            <div className="stat-block__edit-row">
              <label>CR</label>
              <input
                value={attrs.cr}
                onChange={(e) => updateAttr('cr', e.target.value)}
                style={{ width: '3rem' }}
              />
              <label>XP</label>
              <input
                value={attrs.xp}
                onChange={(e) => updateAttr('xp', e.target.value)}
                style={{ width: '4rem' }}
              />
            </div>

            {/* Traits */}
            <h4>Traits</h4>
            <EntryListEditor
              entries={traits}
              onChange={(entries) =>
                updateAttr('traits', JSON.stringify(entries))
              }
              addLabel="Add Trait"
            />

            {/* Actions */}
            <h4>Actions</h4>
            <EntryListEditor
              entries={actions}
              onChange={(entries) =>
                updateAttr('actions', JSON.stringify(entries))
              }
              addLabel="Add Action"
            />

            {/* Reactions */}
            <h4>Reactions</h4>
            <EntryListEditor
              entries={reactions}
              onChange={(entries) =>
                updateAttr('reactions', JSON.stringify(entries))
              }
              addLabel="Add Reaction"
            />

            {/* Legendary Actions */}
            <h4>Legendary Actions</h4>
            <div className="stat-block__edit-row">
              <label>Description</label>
            </div>
            <textarea
              className="stat-block__edit-textarea"
              value={attrs.legendaryDescription}
              onChange={(e) =>
                updateAttr('legendaryDescription', e.target.value)
              }
              placeholder="The creature can take 3 legendary actions..."
            />
            <EntryListEditor
              entries={legendaryActions}
              onChange={(entries) =>
                updateAttr('legendaryActions', JSON.stringify(entries))
              }
              addLabel="Add Legendary Action"
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
