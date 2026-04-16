import { generateObject, generateText } from 'ai';

const DEFAULT_GENERATION_TEXT_TIMEOUT_MS = 240_000;
const DEFAULT_GENERATION_TEXT_ATTEMPTS = 2;
const DEFAULT_GENERATION_OBJECT_ATTEMPTS = 3;

function resolveTimeoutMs(fallbackMs: number): number {
  const parsed = Number.parseInt(process.env.GENERATION_TEXT_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /aborted|timeout/i.test(error.message);
}

function isRetriableGenerateObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return message.includes('no object generated')
    || message.includes('could not parse the response')
    || message.includes('response did not match')
    || message.includes('did not match schema')
    || message.includes('invalid json')
    || message.includes('json parse');
}

function buildTextTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
}

async function withHardTextTimeout<T>(
  label: string,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  return await new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(buildTextTimeoutError(label, timeoutMs));
    }, timeoutMs);

    task(controller.signal)
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        if (isAbortLikeError(error)) {
          reject(buildTextTimeoutError(label, timeoutMs));
          return;
        }
        reject(error);
      });
  });
}

export async function generateTextWithTimeout(
  label: string,
  options: Parameters<typeof generateText>[0],
  fallbackMs = DEFAULT_GENERATION_TEXT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= DEFAULT_GENERATION_TEXT_ATTEMPTS; attempt += 1) {
    try {
      return await withHardTextTimeout(label, timeoutMs, async (signal) => generateText({
        ...options,
        abortSignal: signal,
      }));
    } catch (error) {
      lastError = error;
      if (!isAbortLikeError(error) || attempt >= DEFAULT_GENERATION_TEXT_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

export async function generateObjectWithTimeout(
  label: string,
  options: Parameters<typeof generateObject>[0],
  fallbackMs = DEFAULT_GENERATION_TEXT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);
  let lastError: unknown = null;

  // Ollama (provider 'ollama.chat') crashes in tool-call mode; force JSON mode.
  const modelProvider = (options.model as Record<string, unknown>).provider;
  const resolvedOptions = typeof modelProvider === 'string' && modelProvider.startsWith('ollama')
    ? { ...options, mode: 'json' as const }
    : options;

  for (let attempt = 1; attempt <= DEFAULT_GENERATION_OBJECT_ATTEMPTS; attempt += 1) {
    try {
      return await withHardTextTimeout(label, timeoutMs, async (signal) => generateObject({
        ...resolvedOptions,
        abortSignal: signal,
      }));
    } catch (error) {
      lastError = error;
      if ((!isAbortLikeError(error) && !isRetriableGenerateObjectError(error))
        || attempt >= DEFAULT_GENERATION_OBJECT_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}
