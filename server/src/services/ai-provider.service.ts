import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';

export type AiProvider = 'anthropic' | 'openai';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

export const SUPPORTED_MODELS: Record<AiProvider, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-haiku-4-20250414',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
  ],
};

export function createModel(provider: AiProvider, apiKey: string, model?: string): LanguageModel {
  const modelId = model || DEFAULT_MODELS[provider];

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}

export async function validateApiKey(provider: AiProvider, apiKey: string): Promise<boolean> {
  try {
    const model = createModel(provider, apiKey);
    await generateText({
      model,
      prompt: 'Say "ok".',
      maxOutputTokens: 5,
    });
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const redacted = message.replace(/sk-[a-zA-Z0-9\-_]+/g, '[REDACTED]');
    console.error(`[AI] Key validation failed for ${provider}:`, redacted);

    // Auth-related errors mean the key is invalid — return false
    const isAuthError = /401|403|Unauthorized|Forbidden|Incorrect|invalid.*(key|api)|invalid_api_key/i.test(message);
    // Also check statusCode property on AI SDK errors
    const statusCode = (err as { statusCode?: number }).statusCode
      ?? (err as { status?: number }).status;
    if (isAuthError || statusCode === 401 || statusCode === 403) return false;

    // Non-auth errors (network, rate-limit, server errors) — re-throw so
    // the route can return a 500 instead of a misleading { valid: false }
    throw err;
  }
}
