import { useState } from 'react';
import { useAiStore } from '../../stores/aiStore';

interface AiAutoFillButtonProps {
  blockType: string;
  currentAttrs: Record<string, unknown>;
  onApply: (suggestions: Record<string, unknown>) => void;
}

export function AiAutoFillButton({ blockType, currentAttrs, onApply }: AiAutoFillButtonProps) {
  const { autoFillBlock, isAutoFilling, settings } = useAiStore();
  const [suggestions, setSuggestions] = useState<Record<string, unknown> | null>(null);

  if (!settings?.hasApiKey) return null;

  async function handleAutoFill() {
    const result = await autoFillBlock(blockType, currentAttrs);
    if (result) {
      setSuggestions(result);
    }
  }

  function handleApply() {
    if (suggestions) {
      onApply(suggestions);
      setSuggestions(null);
    }
  }

  if (suggestions) {
    return (
      <div className="ai-autofill-preview">
        <p className="ai-autofill-title">AI Suggestions:</p>
        <div className="ai-autofill-list">
          {Object.entries(suggestions).map(([key, value]) => (
            <div key={key} className="ai-autofill-item">
              <span className="ai-autofill-key">{key}:</span>{' '}
              <span className="ai-autofill-value">
                {typeof value === 'string' ? (value.length > 80 ? value.slice(0, 80) + '...' : value) : JSON.stringify(value)}
              </span>
            </div>
          ))}
        </div>
        <div className="ai-autofill-actions">
          <button onClick={() => setSuggestions(null)} type="button" className="ai-autofill-cancel">
            Dismiss
          </button>
          <button onClick={handleApply} type="button" className="ai-autofill-apply">
            Apply All
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleAutoFill}
      disabled={isAutoFilling}
      type="button"
      className="ai-autofill-btn"
      title="Auto-fill empty fields with AI"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
      {isAutoFilling ? 'Filling...' : 'Auto-fill'}
    </button>
  );
}
