import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { ChapterHeaderAttrs } from './ChapterHeaderExtension';
import { AiGenerateButton } from '../../ai/AiGenerateButton';
import { AiAutoFillButton } from '../../ai/AiAutoFillButton';
import { ImageUploader } from '../../editor/ImageUploader';

export function ChapterHeaderView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as ChapterHeaderAttrs;

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`chapter-header${selected ? ' chapter-header--selected' : ''}`}
        contentEditable={false}
        style={
          attrs.backgroundImage
            ? {
                backgroundImage: `url(${attrs.backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete chapter header"
        >
          Delete
        </button>

        {/* Drag handle */}
        <div data-drag-handle="" className="chapter-header__drag-handle">
          {/* Chapter number */}
          {attrs.chapterNumber && (
            <div className="chapter-header__number">{attrs.chapterNumber}</div>
          )}

          {/* Title */}
          <h1 className="chapter-header__title">{attrs.title}</h1>

          {/* Decorative underline */}
          <div className="chapter-header__underline" />

          {/* Subtitle */}
          {attrs.subtitle && (
            <div className="chapter-header__subtitle">{attrs.subtitle}</div>
          )}
        </div>

        {/* Edit panel when selected */}
        {selected && (
          <div className="chapter-header__edit-panel">
            <div className="chapter-header__edit-row">
              <label>Chapter #</label>
              <input
                value={attrs.chapterNumber}
                onChange={(e) => updateAttr('chapterNumber', e.target.value)}
                placeholder="e.g. Chapter 1"
              />
            </div>
            <div className="chapter-header__edit-row">
              <label>Title</label>
              <input
                value={attrs.title}
                onChange={(e) => updateAttr('title', e.target.value)}
                placeholder="Chapter title"
              />
            </div>
            <div className="chapter-header__edit-row">
              <label>Subtitle</label>
              <input
                value={attrs.subtitle}
                onChange={(e) => updateAttr('subtitle', e.target.value)}
                placeholder="Optional subtitle"
              />
            </div>
            <div className="chapter-header__edit-row block-button-group" style={{ justifyContent: 'flex-start' }}>
              <AiGenerateButton blockType="chapterHeader" onGenerated={updateAttributes} />
              <AiAutoFillButton blockType="chapterHeader" currentAttrs={{ ...attrs }} onApply={updateAttributes} />
            </div>
            <div className="chapter-header__edit-row">
              <label>Background</label>
              {projectId && (
                <ImageUploader
                  projectId={projectId}
                  onUpload={(url) => updateAttr('backgroundImage', url)}
                  className="mb-2"
                />
              )}
              <input
                value={attrs.backgroundImage}
                onChange={(e) => updateAttr('backgroundImage', e.target.value)}
                placeholder="Or enter image URL"
              />
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
