import { generateText } from 'ai';

const DEFAULT_GENERATION_TEXT_TIMEOUT_MS = 180_000;

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

export async function generateTextWithTimeout(
  label: string,
  options: Parameters<typeof generateText>[0],
  fallbackMs = DEFAULT_GENERATION_TEXT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);

  try {
    return await generateText({
      ...options,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  }
}
