import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageUploader } from './ImageUploader';
import { ProjectAssetBrowser } from './ProjectAssetBrowser';
import { AiImageGenerateButton } from '../ai/AiImageGenerateButton';

interface ProjectImageControlsProps {
  projectId: string;
  blockType: string;
  imageUrl: string;
  imagePrompt?: string;
  onUrlChange: (url: string) => void;
  onPromptChange?: (prompt: string) => void;
  urlPlaceholder?: string;
  promptPlaceholder?: string;
}

export function ProjectImageControls({
  projectId,
  blockType,
  imageUrl,
  imagePrompt = '',
  onUrlChange,
  onPromptChange,
  urlPlaceholder = 'Or enter image URL',
  promptPlaceholder = 'Optional art prompt for AI generation',
}: ProjectImageControlsProps) {
  const hasImage = imageUrl.trim().length > 0;
  const [isChooserOpen, setIsChooserOpen] = useState(false);

  useEffect(() => {
    if (!isChooserOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsChooserOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isChooserOpen]);

  const chooserControls = (
    <div className="space-y-3">
      <ImageUploader
        projectId={projectId}
        onUpload={onUrlChange}
        className="mb-1"
      />
      <div className="flex flex-wrap gap-2">
        <ProjectAssetBrowser
          projectId={projectId}
          selectedUrl={imageUrl}
          onSelect={onUrlChange}
        />
        <AiImageGenerateButton
          projectId={projectId}
          blockType={blockType}
          initialPrompt={imagePrompt}
          onGenerated={onUrlChange}
        />
      </div>
      <input
        value={imageUrl}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder={urlPlaceholder}
      />
      {onPromptChange && (
        <textarea
          value={imagePrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={promptPlaceholder}
          rows={4}
          className="ai-generate-input"
        />
      )}
    </div>
  );

  const chooserModal = isChooserOpen ? (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        aria-label="Close image chooser"
        onClick={() => setIsChooserOpen(false)}
      />
      <div className="relative z-10 mx-4 max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Image Tools</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-900">
              {hasImage ? 'Edit Image' : 'Add Image'}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Upload, reuse, or generate artwork without hiding the page preview.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 p-2 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-700"
            aria-label="Close image chooser"
            onClick={() => setIsChooserOpen(false)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="border-b border-slate-200 bg-slate-50 p-6 md:border-b-0 md:border-r">
            {hasImage ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <img
                    src={imageUrl}
                    alt="Current artwork"
                    className="max-h-[55vh] w-full object-contain bg-slate-100"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                  >
                    Open Full Size
                  </a>
                  <button
                    type="button"
                    onClick={() => onUrlChange('')}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center text-sm text-slate-500">
                No image selected yet. Use the tools on the right to add one.
              </div>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
            {chooserControls}
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="block-edit-btn"
                onClick={() => setIsChooserOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="space-y-3">
        {hasImage && (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <img
              src={imageUrl}
              alt="Selected artwork"
              className="h-28 w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="block-edit-btn"
            onClick={() => setIsChooserOpen(true)}
          >
            {hasImage ? 'Edit Image' : 'Add Image'}
          </button>
          {hasImage && (
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="ai-generate-cancel"
            >
              View Full Size
            </a>
          )}
        </div>
      </div>

      {chooserModal && typeof document !== 'undefined' ? createPortal(chooserModal, document.body) : null}
    </>
  );
}
