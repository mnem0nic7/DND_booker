import { useState, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { CreditsPageAttrs } from './CreditsPageExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';

export function CreditsPageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const attrs = node.attrs as CreditsPageAttrs;
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
        className={`credits-page transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete credits page"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="" className="credits-page__content">
          <h2 className="credits-page__heading">Credits</h2>

          {/* Credits text */}
          <div className="credits-page__credits-text">
            {attrs.credits.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>

          {/* Divider */}
          <hr className="credits-page__divider" />

          {/* Legal text */}
          <div className="credits-page__legal-section">
            <h3 className="credits-page__legal-heading">Legal</h3>
            <p className="credits-page__legal-text">{attrs.legalText}</p>
          </div>

          {/* Copyright */}
          <p className="credits-page__copyright">
            &copy; {attrs.copyrightYear} All rights reserved.
          </p>
        </div>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div className="block-button-group">
            <AiGenerateButton blockType="creditsPage" onGenerated={updateAttributes} />
            <AiAutoFillButton blockType="creditsPage" currentAttrs={{ ...attrs }} onApply={updateAttributes} />
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
          <div className="credits-page__edit-panel">
            <h4>Credits Details</h4>
            <div className="credits-page__edit-row">
              <label>Copyright Year</label>
              <input
                value={attrs.copyrightYear}
                onChange={(e) => updateAttr('copyrightYear', e.target.value)}
                style={{ width: '5rem' }}
              />
            </div>
            <div className="credits-page__edit-row-col">
              <label>Credits</label>
              <textarea
                className="credits-page__edit-textarea"
                value={attrs.credits}
                onChange={(e) => updateAttr('credits', e.target.value)}
                placeholder="One credit per line..."
                rows={6}
              />
            </div>
            <div className="credits-page__edit-row-col">
              <label>Legal Text (OGL/CC)</label>
              <textarea
                className="credits-page__edit-textarea"
                value={attrs.legalText}
                onChange={(e) => updateAttr('legalText', e.target.value)}
                placeholder="Legal disclaimer text..."
                rows={5}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
