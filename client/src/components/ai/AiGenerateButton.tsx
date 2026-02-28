import { useState } from 'react';
import { useAiStore } from '../../stores/aiStore';

interface AiGenerateButtonProps {
  blockType: string;
  onGenerated: (attrs: Record<string, unknown>) => void;
}

export function AiGenerateButton({ blockType, onGenerated }: AiGenerateButtonProps) {
  const { generateBlock, isGeneratingBlock, settings } = useAiStore();
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');

  const isConfigured = settings?.provider === 'ollama' ? !!settings?.baseUrl : settings?.hasApiKey;
  if (!isConfigured) return null;

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setError('');
    const attrs = await generateBlock(blockType, prompt.trim());
    if (attrs) {
      onGenerated(attrs);
      setPrompt('');
      setIsOpen(false);
    } else {
      setError('Generation failed. Try again.');
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        type="button"
        className="ai-generate-btn"
        title="Generate with AI"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
        Generate with AI
      </button>
    );
  }

  return (
    <div className="ai-generate-panel">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what to generate..."
        rows={2}
        className="ai-generate-input"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleGenerate();
          }
        }}
      />
      {error && <p className="ai-generate-error">{error}</p>}
      <div className="ai-generate-actions">
        <button
          onClick={() => { setIsOpen(false); setPrompt(''); setError(''); }}
          type="button"
          className="ai-generate-cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isGeneratingBlock}
          type="button"
          className="ai-generate-submit"
        >
          {isGeneratingBlock ? 'Generating...' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
