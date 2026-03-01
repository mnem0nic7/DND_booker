import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { TitlePageAttrs } from './TitlePageExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';
import { ImageUploader } from '../../editor/ImageUploader';

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

        {/* Edit toggle */}
        {selected && (
          <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
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
          <div className="title-page__edit-panel">
            <div style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}>
              <AiGenerateButton blockType="titlePage" onGenerated={updateAttributes} />
              <AiAutoFillButton blockType="titlePage" currentAttrs={{ ...attrs }} onApply={updateAttributes} />
            </div>
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
            <div className="title-page__edit-row">
              <label>Cover Image</label>
              {projectId && (
                <ImageUploader
                  projectId={projectId}
                  onUpload={(url) => updateAttr('coverImageUrl', url)}
                  className="mb-2"
                />
              )}
              <input
                value={attrs.coverImageUrl}
                onChange={(e) => updateAttr('coverImageUrl', e.target.value)}
                placeholder="Or enter image URL"
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
