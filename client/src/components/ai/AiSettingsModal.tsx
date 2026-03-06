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
    validateOllama,
    fetchModels,
  } = useAiStore();

  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [liveModels, setLiveModels] = useState<Record<string, string[]>>({});
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
      if (settings.baseUrl) {
        setBaseUrl(settings.baseUrl);
      }
    }
  }, [settings]);

  useEffect(() => {
    // When provider changes, set appropriate default model
    if (provider === 'ollama') {
      // Use first loaded Ollama model, or clear to prevent saving a non-Ollama model
      if (ollamaModels.length) {
        if (!ollamaModels.includes(model)) setModel(ollamaModels[0]);
      } else {
        setModel('');
      }
    } else if (settings?.supportedModels) {
      const models = settings.supportedModels[provider];
      if (models?.length && !models.includes(model)) {
        setModel(models[0]);
      }
    }
  }, [provider, settings?.supportedModels, model, ollamaModels]);

  if (!isSettingsModalOpen) return null;

  const isOllama = provider === 'ollama';
  const models = isOllama
    ? ollamaModels
    : (liveModels[provider] ?? settings?.supportedModels?.[provider] ?? []);

  async function handleSave() {
    setIsSaving(true);
    setError('');
    try {
      await saveSettings(
        provider,
        model,
        isOllama ? undefined : (apiKey || undefined),
        isOllama ? baseUrl : undefined,
      );
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
      // On success, fetch live model list for this provider
      if (valid) {
        try {
          const models = await fetchModels(provider, apiKey);
          if (models.length > 0) {
            setLiveModels((prev) => ({ ...prev, [provider]: models }));
            if (!models.includes(model)) setModel(models[0]);
          }
        } catch {
          // Fall back to hardcoded list silently
        }
      }
    } catch {
      setValidationResult(false);
    } finally {
      setIsValidating(false);
    }
  }

  async function handleValidateOllama() {
    setIsValidating(true);
    setValidationResult(null);
    setError('');
    try {
      const result = await validateOllama(baseUrl);
      setValidationResult(result.valid);
      if (result.valid && result.models.length) {
        setOllamaModels(result.models);
        if (!result.models.includes(model)) {
          setModel(result.models[0]);
        }
      } else if (!result.valid) {
        setError('Could not connect to Ollama. Is it running?');
      }
    } catch {
      setValidationResult(false);
      setError('Could not connect to Ollama.');
    } finally {
      setIsValidating(false);
    }
  }

  async function handleRemoveKey() {
    try {
      await removeApiKey();
      setApiKey('');
      setValidationResult(null);
    } catch {
      setError('Failed to remove API key.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">AI Assistant Settings</h2>
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Provider selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
          <div className="flex gap-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={provider === 'anthropic'}
                onChange={() => { setProvider('anthropic'); setValidationResult(null); setError(''); }}
                className="text-purple-600"
              />
              <span className="text-sm">Anthropic Claude</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === 'openai'}
                onChange={() => { setProvider('openai'); setValidationResult(null); setError(''); }}
                className="text-purple-600"
              />
              <span className="text-sm">OpenAI GPT</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="provider"
                value="ollama"
                checked={provider === 'ollama'}
                onChange={() => { setProvider('ollama'); setValidationResult(null); setError(''); }}
                className="text-purple-600"
              />
              <span className="text-sm">Local Ollama</span>
            </label>
          </div>
        </div>

        {/* Ollama base URL */}
        {isOllama && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ollama Server URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setValidationResult(null); setOllamaModels([]); }}
              placeholder="http://localhost:11434"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500"
            />
            <button
              onClick={handleValidateOllama}
              disabled={!baseUrl || isValidating}
              className="mt-2 px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {isValidating ? 'Connecting...' : 'Connect & Load Models'}
            </button>
            {validationResult === true && ollamaModels.length > 0 && (
              <p className="text-xs mt-1 text-green-600">
                Connected! Found {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''}.
              </p>
            )}
            {validationResult === false && (
              <p className="text-xs mt-1 text-red-600">
                Cannot reach Ollama at this URL.
              </p>
            )}
          </div>
        )}

        {/* Model selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
          {isOllama && models.length === 0 ? (
            <p className="text-sm text-gray-400 italic">
              Connect to Ollama to load available models.
            </p>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
        </div>

        {/* API Key (not shown for Ollama) */}
        {!isOllama && (
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleValidate}
                disabled={!apiKey || isValidating}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {isValidating ? 'Testing...' : 'Validate'}
              </button>
              {settings?.hasApiKey && (
                <button
                  onClick={handleRemoveKey}
                  className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors"
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
        )}

        {/* Cost disclaimer */}
        <p className="text-xs text-gray-400 mb-4">
          {isOllama
            ? 'Ollama runs models locally on your server. No API costs.'
            : 'AI features use your own API key. Costs are billed directly by the provider.'}
        </p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setSettingsModalOpen(false)}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !model}
            className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
