import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { BackCoverAttrs } from './BackCoverExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';
import { ProjectImageControls } from '../../editor/ProjectImageControls';

export function BackCoverView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as BackCoverAttrs;
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
        className={`back-cover transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete back cover"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="" className="back-cover__content">
          {/* Blurb */}
          <div className="back-cover__blurb">
            <p>{attrs.blurb}</p>
          </div>

          {/* Decorative divider */}
          <div className="back-cover__ornament">&#10022; &#10022; &#10022;</div>

          {/* Author section */}
          <div className="back-cover__author-section">
            {attrs.authorImageUrl ? (
              <img
                className="back-cover__author-image"
                src={attrs.authorImageUrl}
                alt="Author"
              />
            ) : (
              <div className="back-cover__author-image-placeholder">
                <span>Photo</span>
              </div>
            )}
            <p className="back-cover__author-bio">{attrs.authorBio}</p>
          </div>

          {/* Barcode placeholder */}
          <div className="back-cover__barcode-area">
            <div className="back-cover__barcode-placeholder">
              <div className="back-cover__barcode-lines">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="back-cover__barcode-line"
                    style={{ width: `${Math.random() * 2 + 1}px` }}
                  />
                ))}
              </div>
              <span className="back-cover__barcode-text">ISBN Barcode Area</span>
            </div>
          </div>
        </div>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <div className="block-button-group">
            <AiGenerateButton blockType="backCover" onGenerated={updateAttributes} />
            <AiAutoFillButton blockType="backCover" currentAttrs={{ ...attrs }} onApply={updateAttributes} />
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
          <div className="back-cover__edit-panel">
            <h4>Back Cover Details</h4>
            <div className="back-cover__edit-row-col">
              <label>Blurb</label>
              <textarea
                className="back-cover__edit-textarea"
                value={attrs.blurb}
                onChange={(e) => updateAttr('blurb', e.target.value)}
                placeholder="Adventure description..."
                rows={4}
              />
            </div>
            <div className="back-cover__edit-row-col">
              <label>Author Bio</label>
              <textarea
                className="back-cover__edit-textarea"
                value={attrs.authorBio}
                onChange={(e) => updateAttr('authorBio', e.target.value)}
                placeholder="About the author..."
                rows={3}
              />
            </div>
            <div className="back-cover__edit-row">
              <label>Author Image</label>
              {projectId && (
                <ProjectImageControls
                  projectId={projectId}
                  blockType="backCover"
                  imageUrl={attrs.authorImageUrl}
                  imagePrompt={attrs.imagePrompt}
                  onUrlChange={(url) => updateAttr('authorImageUrl', url)}
                  onPromptChange={(prompt) => updateAttr('imagePrompt', prompt)}
                  urlPlaceholder="Or enter image URL"
                  promptPlaceholder="Suggested back cover portrait or spot-art prompt"
                />
              )}
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
