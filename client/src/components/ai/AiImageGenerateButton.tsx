import { useEffect, useState } from 'react';
import { useAiStore } from '../../stores/aiStore';

type ImageModel = 'gpt-image-1';

const MODEL_SIZES: Record<ImageModel, { label: string; value: string }[]> = {
  'gpt-image-1': [
    { label: 'Square (1024x1024)', value: '1024x1024' },
    { label: 'Landscape (1536x1024)', value: '1536x1024' },
    { label: 'Portrait (1024x1536)', value: '1024x1536' },
  ],
};

const BLOCK_DEFAULTS: Record<string, { size: string; hint: string }> = {
  titlePage: {
    size: '1024x1536',
    hint: 'Fantasy cover art for a D&D adventure...',
  },
  fullBleedImage: {
    size: '1536x1024',
    hint: 'Fantasy illustration for a D&D sourcebook...',
  },
  mapBlock: {
    size: '1024x1024',
    hint: 'Top-down fantasy RPG battle map...',
  },
  backCover: {
    size: '1024x1024',
    hint: 'Author portrait or small illustration...',
  },
  chapterHeader: {
    size: '1536x1024',
    hint: 'Wide fantasy landscape banner...',
  },
  npcProfile: {
    size: '1024x1024',
    hint: 'Fantasy portrait of a memorable D&D NPC...',
  },
};

interface AiImageGenerateButtonProps {
  projectId: string;
  blockType: string;
  initialPrompt?: string;
  onGenerated: (url: string) => void;
}

export function AiImageGenerateButton({
  projectId,
  blockType,
  initialPrompt,
  onGenerated,
}: AiImageGenerateButtonProps) {
  const { generateImage, isGeneratingImage, settings } = useAiStore();

  const defaults = BLOCK_DEFAULTS[blockType] || { size: '1024x1024', hint: '' };

  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt || '');
  const model: ImageModel = 'gpt-image-1';
  const [size, setSize] = useState(defaults.size);
  const [quality, setQuality] = useState('standard');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setPrompt(initialPrompt || '');
    }
  }, [initialPrompt, isOpen]);

  // Only show when provider is OpenAI with an API key
  const isAvailable = settings?.provider === 'openai' && settings?.hasApiKey;
  if (!isAvailable) return null;

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setError('');
    const url = await generateImage(projectId, prompt.trim(), model, size, quality);
    if (url) {
      onGenerated(url);
      setPrompt('');
      setIsOpen(false);
    } else {
      setError('Image generation failed. Try a different prompt or check your API key.');
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        type="button"
        className="ai-generate-btn"
        title="Generate image with AI"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
        Generate Image with AI
      </button>
    );
  }

  const sizes = MODEL_SIZES[model];

  return (
    <div className="ai-generate-panel">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={defaults.hint}
        rows={3}
        className="ai-generate-input"
      />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '120px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>Size</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value)}
            className="ai-generate-input"
            style={{ padding: '4px 6px', minHeight: 'unset' }}
          >
            {sizes.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: '100px' }}>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>Quality</span>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="ai-generate-input"
            style={{ padding: '4px 6px', minHeight: 'unset' }}
          >
            <option value="standard">Standard</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>

      {error && <p className="ai-generate-error">{error}</p>}

      <div className="ai-generate-actions">
        <button
          onClick={() => { setIsOpen(false); setPrompt(''); setError(''); }}
          type="button"
          className="ai-generate-cancel"
          disabled={isGeneratingImage}
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGeneratingImage}
          type="button"
          className="ai-generate-submit"
        >
          {isGeneratingImage ? 'Generating...' : 'Generate Image'}
        </button>
      </div>
    </div>
  );
}
