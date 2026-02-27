import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { NpcProfileAttrs } from './NpcProfileExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';
import { ImageUploader } from '../../editor/ImageUploader';

export function NpcProfileView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as NpcProfileAttrs;
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
        className={`npc-profile${selected ? ' ring-2 ring-amber-700 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="npc-profile__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete NPC profile"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div className="npc-profile__header" data-drag-handle="">
          {/* Portrait area */}
          <div className="npc-profile__portrait">
            {attrs.portraitUrl ? (
              <img
                src={attrs.portraitUrl}
                alt={attrs.name}
                className="npc-profile__portrait-img"
              />
            ) : (
              <div className="npc-profile__portrait-placeholder">
                <span>Portrait</span>
              </div>
            )}
          </div>
          <div className="npc-profile__header-info">
            <h2 className="npc-profile__name">{attrs.name}</h2>
            <div className="npc-profile__subtitle">
              {attrs.race} {attrs.class}
            </div>
          </div>
        </div>

        {/* Divider */}
        <hr className="npc-profile__divider" />

        {/* Description */}
        {attrs.description && (
          <div className="npc-profile__description">{attrs.description}</div>
        )}

        {/* Personality section */}
        <div className="npc-profile__personality">
          {attrs.personalityTraits && (
            <div className="npc-profile__trait">
              <span className="npc-profile__trait-label">
                Personality Traits.
              </span>{' '}
              {attrs.personalityTraits}
            </div>
          )}
          {attrs.ideals && (
            <div className="npc-profile__trait">
              <span className="npc-profile__trait-label">Ideals.</span>{' '}
              {attrs.ideals}
            </div>
          )}
          {attrs.bonds && (
            <div className="npc-profile__trait">
              <span className="npc-profile__trait-label">Bonds.</span>{' '}
              {attrs.bonds}
            </div>
          )}
          {attrs.flaws && (
            <div className="npc-profile__trait">
              <span className="npc-profile__trait-label">Flaws.</span>{' '}
              {attrs.flaws}
            </div>
          )}
        </div>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="npcProfile"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="npcProfile"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#7c4a1e',
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
          <div className="npc-profile__edit-panel">
            <h4>Basic Info</h4>
            <div className="npc-profile__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="npc-profile__edit-row">
              <label>Race</label>
              <input
                value={attrs.race}
                onChange={(e) => updateAttr('race', e.target.value)}
              />
            </div>
            <div className="npc-profile__edit-row">
              <label>Class</label>
              <input
                value={attrs.class}
                onChange={(e) => updateAttr('class', e.target.value)}
              />
            </div>
            <div className="npc-profile__edit-row">
              <label>Portrait</label>
              {projectId && (
                <ImageUploader
                  projectId={projectId}
                  onUpload={(url) => updateAttr('portraitUrl', url)}
                  className="mb-2"
                />
              )}
              <input
                value={attrs.portraitUrl}
                onChange={(e) => updateAttr('portraitUrl', e.target.value)}
                placeholder="Or enter image URL"
              />
            </div>

            <h4>Description</h4>
            <textarea
              className="npc-profile__edit-textarea"
              value={attrs.description}
              onChange={(e) => updateAttr('description', e.target.value)}
              placeholder="Brief description of the NPC..."
            />

            <h4>Personality</h4>
            <div className="npc-profile__edit-row">
              <label>Traits</label>
            </div>
            <textarea
              className="npc-profile__edit-textarea"
              value={attrs.personalityTraits}
              onChange={(e) =>
                updateAttr('personalityTraits', e.target.value)
              }
              placeholder="Personality traits..."
            />
            <div className="npc-profile__edit-row">
              <label>Ideals</label>
            </div>
            <textarea
              className="npc-profile__edit-textarea"
              value={attrs.ideals}
              onChange={(e) => updateAttr('ideals', e.target.value)}
              placeholder="Ideals..."
            />
            <div className="npc-profile__edit-row">
              <label>Bonds</label>
            </div>
            <textarea
              className="npc-profile__edit-textarea"
              value={attrs.bonds}
              onChange={(e) => updateAttr('bonds', e.target.value)}
              placeholder="Bonds..."
            />
            <div className="npc-profile__edit-row">
              <label>Flaws</label>
            </div>
            <textarea
              className="npc-profile__edit-textarea"
              value={attrs.flaws}
              onChange={(e) => updateAttr('flaws', e.target.value)}
              placeholder="Flaws..."
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
