import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, type LanguageModel } from 'ai';

export type AiProvider = 'anthropic' | 'openai' | 'ollama';

const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  ollama: 'llama3.1:8b',
};

export const SUPPORTED_MODELS: Record<AiProvider, string[]> = {
  anthropic: [
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514',
    'claude-haiku-4-20250414',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'o3',
    'o3-mini',
    'o4-mini',
  ],
  ollama: [],
};

// --- Dynamic OpenAI model fetching with cache ---
let _openAiModelCache: { models: string[]; expiresAt: number } | null = null;
const OPENAI_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-'];

export async function fetchOpenAiModels(apiKey: string): Promise<string[]> {
  // Return cache if still valid
  if (_openAiModelCache && Date.now() < _openAiModelCache.expiresAt) {
    return _openAiModelCache.models;
  }

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return SUPPORTED_MODELS.openai;

    const data = (await res.json()) as { data?: { id: string }[] };
    const allModels = (data.data ?? []).map((m) => m.id);

    // Filter to chat-capable models and sort
    const chatModels = allModels
      .filter((id) => OPENAI_CHAT_PREFIXES.some((p) => id.startsWith(p)))
      .filter((id) => !id.includes('realtime') && !id.includes('audio') && !id.includes('transcri'))
      .sort((a, b) => a.localeCompare(b));

    const models = chatModels.length > 0 ? chatModels : SUPPORTED_MODELS.openai;

    _openAiModelCache = { models, expiresAt: Date.now() + OPENAI_CACHE_TTL_MS };
    return models;
  } catch {
    return SUPPORTED_MODELS.openai;
  }
}

/** @internal — exposed for tests */
export function _resetModelCache() {
  _openAiModelCache = null;
}

export function createModel(
  provider: AiProvider,
  apiKey: string,
  model?: string,
  baseUrl?: string,
): LanguageModel {
  const modelId = model || DEFAULT_MODELS[provider];

  if (provider === 'anthropic') {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId);
  }

  if (provider === 'ollama') {
    const ollama = createOpenAI({
      apiKey: 'ollama',
      baseURL: `${baseUrl || 'http://localhost:11434'}/v1`,
    });
    return ollama.chat(modelId);
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}

/**
 * Validate that a URL is safe for server-side requests (blocks private/internal IPs).
 * Prevents SSRF attacks via user-controlled Ollama base URLs.
 */
export function assertSafeUrl(rawUrl: string): void {
  const parsed = new URL(rawUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https protocols are allowed');
  }
  const hostname = parsed.hostname.toLowerCase();
  // Block loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    throw new Error('Loopback addresses are not allowed');
  }
  // Block common metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    throw new Error('Cloud metadata endpoints are not allowed');
  }
  // Block private IP ranges (RFC 1918 + link-local)
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (ipMatch) {
    const [, first, second] = ipMatch.map(Number);
    if (first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || first === 169) {
      throw new Error('Private network addresses are not allowed');
    }
  }
  // Block Docker internal hostnames (host.docker.internal allowed for Ollama on host)
  const blockedHosts = ['postgres', 'redis', 'server', 'worker', 'client'];
  if (blockedHosts.includes(hostname)) {
    throw new Error('Internal service hostnames are not allowed');
  }
}

export async function validateConnection(baseUrl: string): Promise<{ valid: boolean; models: string[] }> {
  try {
    assertSafeUrl(baseUrl);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { valid: false, models: [] };
    const data = await res.json() as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m: { name: string }) => m.name);
    return { valid: true, models };
  } catch {
    return { valid: false, models: [] };
  }
}

export async function validateApiKey(provider: AiProvider, apiKey: string, baseUrl?: string): Promise<boolean> {
  try {
    const model = createModel(provider, apiKey, undefined, baseUrl);
    await generateText({
      model,
      prompt: 'Say "ok".',
      maxOutputTokens: 16,
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
