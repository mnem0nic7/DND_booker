import { useState } from 'react';
import { useAgentStore } from '../../stores/agentStore';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AutonomousAgentDialog({ projectId, isOpen, onClose }: Props) {
  const { startRun, isStarting, error } = useAgentStore();
  const [mode, setMode] = useState<'persistent_editor' | 'background_producer'>('persistent_editor');
  const [objective, setObjective] = useState('Improve this project into a stronger DM-ready adventure package.');
  const [prompt, setPrompt] = useState('');
  const [generationMode, setGenerationMode] = useState<'one_shot' | 'module' | 'campaign' | 'sourcebook'>('one_shot');
  const [generationQuality, setGenerationQuality] = useState<'quick' | 'polished'>('polished');

  if (!isOpen) return null;

  async function handleStart() {
    await startRun(projectId, {
      mode,
      objective: objective.trim() || undefined,
      prompt: mode === 'background_producer' ? prompt.trim() || undefined : undefined,
      generationMode,
      generationQuality,
    });
    if (!useAgentStore.getState().error) {
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="autonomous-agent-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5">
        <h2 id="autonomous-agent-title" className="text-lg font-semibold text-gray-800 mb-4">Autonomous Creative Director</h2>

        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('persistent_editor')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                mode === 'persistent_editor'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Improve Current Project
            </button>
            <button
              onClick={() => setMode('background_producer')}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                mode === 'background_producer'
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Produce From Prompt
            </button>
          </div>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Objective
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          className="w-full border border-gray-300 rounded-md p-2 text-sm h-20 resize-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          placeholder="Improve the module for Dungeon Master usability, dense encounter packets, and better page economy."
        />

        {mode === 'background_producer' && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Generation Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              placeholder="A frontier horror one-shot about a cursed blackglass mine and the grieving spirits trapped inside."
            />
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Generation Type</label>
            <select
              value={generationMode}
              onChange={(e) => setGenerationMode(e.target.value as typeof generationMode)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="one_shot">One Shot</option>
              <option value="module">Module</option>
              <option value="campaign">Campaign</option>
              <option value="sourcebook">Sourcebook</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Seed Quality</label>
            <select
              value={generationQuality}
              onChange={(e) => setGenerationQuality(e.target.value as typeof generationQuality)}
              className="w-full border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value="quick">Quick</option>
              <option value="polished">Polished</option>
            </select>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={isStarting || (mode === 'background_producer' && !prompt.trim())}
            className="text-sm px-4 py-2 rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isStarting ? 'Starting...' : 'Start Director'}
          </button>
        </div>
      </div>
    </div>
  );
}
