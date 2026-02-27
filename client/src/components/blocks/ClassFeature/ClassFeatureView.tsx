import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { ClassFeatureAttrs } from './ClassFeatureExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

export function ClassFeatureView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as ClassFeatureAttrs;
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
        className={`class-feature${selected ? ' ring-2 ring-red-700 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="class-feature__delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete class feature"
        >
          Delete
        </button>

        {/* Header (drag handle) */}
        <div data-drag-handle="">
          <h2 className="class-feature__name">{attrs.name}</h2>
          <div className="class-feature__subtitle">
            Level {attrs.level} {attrs.className} Feature
          </div>
        </div>

        {/* Divider */}
        <hr className="class-feature__divider" />

        {/* Description */}
        <div className="class-feature__description">{attrs.description}</div>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <AiGenerateButton
              blockType="classFeature"
              onGenerated={(attrs) => updateAttributes(attrs)}
            />
            <AiAutoFillButton
              blockType="classFeature"
              currentAttrs={node.attrs as Record<string, unknown>}
              onApply={(suggestions) => updateAttributes(suggestions)}
            />
            <button
              onClick={() => setEditing((v) => !v)}
              type="button"
              style={{
                background: '#991b1b',
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
          <div className="class-feature__edit-panel">
            <h4>Feature Info</h4>
            <div className="class-feature__edit-row">
              <label>Name</label>
              <input
                value={attrs.name}
                onChange={(e) => updateAttr('name', e.target.value)}
              />
            </div>
            <div className="class-feature__edit-row">
              <label>Level</label>
              <input
                type="number"
                value={attrs.level}
                onChange={(e) => updateAttr('level', Number(e.target.value))}
                min={1}
                max={20}
                style={{ width: '3.5rem' }}
              />
            </div>
            <div className="class-feature__edit-row">
              <label>Class</label>
              <input
                value={attrs.className}
                onChange={(e) => updateAttr('className', e.target.value)}
              />
            </div>

            <h4>Description</h4>
            <textarea
              className="class-feature__edit-textarea"
              value={attrs.description}
              onChange={(e) => updateAttr('description', e.target.value)}
              placeholder="Describe the class feature..."
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
