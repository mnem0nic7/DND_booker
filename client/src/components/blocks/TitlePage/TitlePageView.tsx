import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { TitlePageAttrs } from './TitlePageExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';
import { ProjectImageControls } from '../../editor/ProjectImageControls';

export function TitlePageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as TitlePageAttrs;
  const [editing, setEditing] = useState(false);

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  const imageControls = projectId ? (
    <div className="mt-3 rounded-lg border border-gray-200 bg-white/90 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        Cover Artwork
      </p>
      <ProjectImageControls
        projectId={projectId}
        blockType="titlePage"
        imageUrl={attrs.coverImageUrl}
        imagePrompt={attrs.imagePrompt}
        onUrlChange={(url) => updateAttr('coverImageUrl', url)}
        onPromptChange={(prompt) => updateAttr('imagePrompt', prompt)}
        urlPlaceholder="Or enter image URL"
        promptPlaceholder="Suggested cover art prompt"
      />
    </div>
  ) : null;

  return (
    <NodeViewWrapper>
      <div
        className={`title-page transition-shadow${selected ? ' ring-2 ring-purple-500 ring-offset-2' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete title page"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="" className="title-page__content">
          {/* Cover image placeholder */}
          {attrs.coverImageUrl ? (
            <div className="title-page__cover-image">
              <img src={attrs.coverImageUrl} alt="Cover" />
            </div>
          ) : (
            <div className="title-page__cover-placeholder">
              <span className="title-page__cover-placeholder-text">Cover Image</span>
            </div>
          )}

          {/* Title */}
          <h1 className="title-page__title">{attrs.title}</h1>

          {/* Subtitle */}
          {attrs.subtitle && (
            <p className="title-page__subtitle">{attrs.subtitle}</p>
          )}

          {/* Decorative divider */}
          <div className="title-page__ornament">&#10022;</div>

          {/* Author */}
          {attrs.author && (
            <p className="title-page__author">by {attrs.author}</p>
          )}
        </div>

        {/* Edit toggle + AI buttons */}
        {selected && (
          <>
            <div className="block-button-group">
              <AiGenerateButton blockType="titlePage" onGenerated={updateAttributes} />
              <AiAutoFillButton blockType="titlePage" currentAttrs={{ ...attrs }} onApply={updateAttributes} />
              <button
                onClick={() => setEditing((v) => !v)}
                type="button"
                className="block-edit-btn"
              >
                {editing ? 'Done Editing' : 'Edit Properties'}
              </button>
            </div>
            {imageControls}
          </>
        )}

        {/* Edit panel */}
        {selected && editing && (
          <div className="title-page__edit-panel">
            <h4>Title Page Details</h4>
            <div className="title-page__edit-row">
              <label>Title</label>
              <input
                value={attrs.title}
                onChange={(e) => updateAttr('title', e.target.value)}
              />
            </div>
            <div className="title-page__edit-row">
              <label>Subtitle</label>
              <input
                value={attrs.subtitle}
                onChange={(e) => updateAttr('subtitle', e.target.value)}
              />
            </div>
            <div className="title-page__edit-row">
              <label>Author</label>
              <input
                value={attrs.author}
                onChange={(e) => updateAttr('author', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
