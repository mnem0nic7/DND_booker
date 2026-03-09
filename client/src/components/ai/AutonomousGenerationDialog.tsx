import { useState } from 'react';
import { useGenerationStore } from '../../stores/generationStore';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AutonomousGenerationDialog({ projectId, isOpen, onClose }: Props) {
  const { startRun, isStarting, error } = useGenerationStore();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'one_shot' | 'module' | 'campaign' | 'sourcebook'>('one_shot');
  const [quality, setQuality] = useState<'quick' | 'polished'>('quick');
  const [pageTarget, setPageTarget] = useState<number | ''>('');

  if (!isOpen) return null;

  async function handleStart() {
    if (!prompt.trim()) return;
    await startRun(projectId, prompt.trim(), mode, quality, pageTarget || undefined);
    if (!useGenerationStore.getState().error) {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="autonomous-generation-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5">
        <h2 id="autonomous-generation-title" className="text-lg font-semibold text-gray-800 mb-4">Generate Content</h2>

        {/* Prompt */}
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Describe your adventure
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A dark forest adventure where goblins have stolen a sacred artifact..."
          className="w-full border border-gray-300 rounded-md p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        {/* Mode */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <div className="flex gap-2">
            {(['one_shot', 'module', 'campaign', 'sourcebook'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  mode === m
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Quality */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Quality</label>
          <div className="flex gap-2">
            <button
              onClick={() => setQuality('quick')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                quality === 'quick'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Quick Draft
            </button>
            <button
              onClick={() => setQuality('polished')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                quality === 'polished'
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Polished
            </button>
          </div>
        </div>

        {/* Page target */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Target Pages <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="number"
            value={pageTarget}
            onChange={(e) => setPageTarget(e.target.value ? Number(e.target.value) : '')}
            min={5}
            max={500}
            placeholder="e.g. 30"
            className="w-24 border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        {/* Error */}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {/* Actions */}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || isStarting}
            className="text-sm px-4 py-2 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? 'Starting...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
