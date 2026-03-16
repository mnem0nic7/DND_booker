import type { LanguageModel } from 'ai';
import { getAiSettings, getDecryptedApiKey } from '../ai-settings.service.js';
import { createModel } from '../ai-provider.service.js';

export async function resolveAgentModelForUser(userId: string): Promise<{
  model: LanguageModel;
  maxOutputTokens: number;
}> {
  const settings = await getAiSettings(userId);
  if (!settings?.provider) throw new Error('AI not configured for user');

  const maxOutputTokens = settings.provider === 'ollama' ? 1024 : 16384;

  if (settings.provider === 'ollama') {
    const ollamaModel = settings.model && !settings.model.startsWith('claude-') && !settings.model.startsWith('gpt-')
      ? settings.model
      : undefined;
    return {
      model: createModel(settings.provider, 'ollama', ollamaModel, settings.baseUrl ?? undefined),
      maxOutputTokens,
    };
  }

  if (!settings.hasApiKey) throw new Error('No API key configured');
  const apiKey = await getDecryptedApiKey(userId);
  if (!apiKey) throw new Error('Failed to decrypt API key');

  return {
    model: createModel(settings.provider, apiKey, settings.model ?? undefined),
    maxOutputTokens,
  };
}
