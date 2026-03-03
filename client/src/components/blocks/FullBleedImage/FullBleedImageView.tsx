import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { NodeViewWrapper } from '@tiptap/react';
import type { ReactNodeViewProps } from '@tiptap/react';
import type { FullBleedImageAttrs } from './FullBleedImageExtension';
import { AiImageGenerateButton } from '../../ai/AiImageGenerateButton';
import { ImageUploader } from '../../editor/ImageUploader';

const POSITION_OPTIONS: { value: FullBleedImageAttrs['position']; label: string }[] = [
  { value: 'full', label: 'Full Width' },
  { value: 'half', label: 'Half Width' },
  { value: 'quarter', label: 'Quarter Width' },
];

export function FullBleedImageView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const attrs = node.attrs as FullBleedImageAttrs;

  const updateAttr = useCallback(
    (key: string, value: string) => {
      updateAttributes({ [key]: value });
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper>
      <div
        className={`full-bleed-image full-bleed-image--${attrs.position}${selected ? ' full-bleed-image--selected' : ''}`}
        contentEditable={false}
      >
        {/* Delete button */}
        <button
          className="block-delete-btn"
          onClick={deleteNode}
          type="button"
          title="Delete image block"
        >
          Delete
        </button>

        {/* Drag handle + image area */}
        <div data-drag-handle="" className="full-bleed-image__drag-handle">
          {attrs.src ? (
            <img
              className="full-bleed-image__img"
              src={attrs.src}
              alt={attrs.caption || 'Full bleed image'}
            />
          ) : (
            <div className="full-bleed-image__placeholder">
              <span className="full-bleed-image__placeholder-icon">&#128247;</span>
              <span className="full-bleed-image__placeholder-text">No image set</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {attrs.caption && (
          <div className="full-bleed-image__caption">{attrs.caption}</div>
        )}

        {/* Edit panel when selected */}
        {selected && (
          <div className="full-bleed-image__edit-panel">
            <div className="full-bleed-image__edit-row">
              <label>Image</label>
              {projectId && (
                <>
                  <ImageUploader
                    projectId={projectId}
                    onUpload={(url) => updateAttr('src', url)}
                    className="mb-2"
                  />
                  <AiImageGenerateButton
                    projectId={projectId}
                    blockType="fullBleedImage"
                    onGenerated={(url) => updateAttr('src', url)}
                  />
                </>
              )}
              <input
                value={attrs.src}
                onChange={(e) => updateAttr('src', e.target.value)}
                placeholder="Or enter image URL"
              />
            </div>
            <div className="full-bleed-image__edit-row">
              <label>Caption</label>
              <input
                value={attrs.caption}
                onChange={(e) => updateAttr('caption', e.target.value)}
                placeholder="Image caption"
              />
            </div>
            <div className="full-bleed-image__edit-row">
              <label>Size</label>
              <div className="full-bleed-image__size-selector">
                {POSITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`full-bleed-image__size-btn${attrs.position === opt.value ? ' full-bleed-image__size-btn--active' : ''}`}
                    onClick={() => updateAttr('position', opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
