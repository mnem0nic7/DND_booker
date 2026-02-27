import { useState, useEffect } from 'react';
import { useAiStore, type AiProvider } from '../../stores/aiStore';

export function AiSettingsModal() {
  const {
    settings,
    isSettingsModalOpen,
    setSettingsModalOpen,
    fetchSettings,
    saveSettings,
    removeApiKey,
    validateKey,
  } = useAiStore();

  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSettingsModalOpen) {
      fetchSettings();
    }
  }, [isSettingsModalOpen, fetchSettings]);

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider || 'anthropic');
      setModel(settings.model || '');
    }
  }, [settings]);

  useEffect(() => {
    // When provider changes, set default model
    if (settings?.supportedModels) {
      const models = settings.supportedModels[provider];
      if (models?.length && !models.includes(model)) {
        setModel(models[0]);
      }
    }
  }, [provider, settings?.supportedModels, model]);

  if (!isSettingsModalOpen) return null;

  const models = settings?.supportedModels?.[provider] ?? [];

  async function handleSave() {
    setIsSaving(true);
    setError('');
    try {
      await saveSettings(provider, model, apiKey || undefined);
      setApiKey('');
      setSettingsModalOpen(false);
    } catch {
      setError('Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleValidate() {
    if (!apiKey) return;
    setIsValidating(true);
    setValidationResult(null);
    try {
      const valid = await validateKey(provider, apiKey);
      setValidationResult(valid);
    } catch {
      setValidationResult(false);
    } finally {
      setIsValidating(false);
    }
  }

  async function handleRemoveKey() {
    await removeApiKey();
    setApiKey('');
    setValidationResult(null);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">AI Assistant Settings</h2>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={provider === 'anthropic'}
                onChange={() => setProvider('anthropic')}
                className="text-indigo-600"
              />
              <span className="text-sm">Anthropic Claude</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === 'openai'}
                onChange={() => setProvider('openai')}
                className="text-indigo-600"
              />
              <span className="text-sm">OpenAI GPT</span>
            </label>
          </div>
        </div>

        {/* Model selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
            {settings?.hasApiKey && (
              <span className="ml-2 text-xs text-green-600 font-normal">Saved</span>
            )}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setValidationResult(null); }}
            placeholder={settings?.hasApiKey ? '••••••••••••••••' : 'Enter your API key'}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleValidate}
              disabled={!apiKey || isValidating}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {isValidating ? 'Testing...' : 'Validate'}
            </button>
            {settings?.hasApiKey && (
              <button
                onClick={handleRemoveKey}
                className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
              >
                Remove Key
              </button>
            )}
          </div>
          {validationResult !== null && (
            <p className={`text-xs mt-1 ${validationResult ? 'text-green-600' : 'text-red-600'}`}>
              {validationResult ? 'API key is valid!' : 'API key is invalid. Please check and try again.'}
            </p>
          )}
        </div>

        {/* Cost disclaimer */}
        <p className="text-xs text-gray-400 mb-4">
          AI features use your own API key. Costs are billed directly by the provider.
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
