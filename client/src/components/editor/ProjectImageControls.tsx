import { useEffect, useState } from 'react';
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
  const [isChangingImage, setIsChangingImage] = useState(() => !hasImage);

  useEffect(() => {
    if (!hasImage) {
      setIsChangingImage(true);
    }
  }, [hasImage]);

  if (hasImage && !isChangingImage) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="block-edit-btn"
          onClick={() => setIsChangingImage(true)}
        >
          Change Image
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hasImage && (
        <div className="flex justify-start">
          <button
            type="button"
            className="block-edit-btn"
            onClick={() => setIsChangingImage(false)}
          >
            Done
          </button>
        </div>
      )}
      <ImageUploader
        projectId={projectId}
        onUpload={onUrlChange}
        className="mb-2"
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
          rows={3}
          className="ai-generate-input"
        />
      )}
    </div>
  );
}
