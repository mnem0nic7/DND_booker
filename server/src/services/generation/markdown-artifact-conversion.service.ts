import path from 'node:path';
import { fork } from 'node:child_process';

const DEFAULT_MARKDOWN_CONVERSION_TIMEOUT_MS = 60_000;

interface MarkdownConversionResult {
  ok: boolean;
  content?: unknown;
  error?: string;
}

function resolveTimeoutMs(fallbackMs: number): number {
  const parsed = Number.parseInt(process.env.MARKDOWN_CONVERSION_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
}

function buildTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} markdown conversion timed out after ${Math.round(timeoutMs / 1000)}s`);
}

function resolveWorkerPath(): string {
  const workerFilename = __filename.endsWith('.ts')
    ? 'markdown-conversion.worker.ts'
    : 'markdown-conversion.worker.js';
  return path.join(__dirname, workerFilename);
}

function resolveExecArgv(): string[] | undefined {
  if (__filename.endsWith('.ts')) {
    return ['--import', 'tsx'];
  }
  return undefined;
}

export async function convertMarkdownToTipTapWithTimeout(
  markdown: string,
  label: string,
  fallbackMs = DEFAULT_MARKDOWN_CONVERSION_TIMEOUT_MS,
): Promise<unknown> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);

  return await new Promise<unknown>((resolve, reject) => {
    const child = fork(resolveWorkerPath(), [], {
      execArgv: resolveExecArgv(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });

    let settled = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    const finalize = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      child.removeAllListeners();
      callback();
      child.kill('SIGKILL');
    };

    timeoutHandle = setTimeout(() => {
      finalize(() => reject(buildTimeoutError(label, timeoutMs)));
    }, timeoutMs);

    child.once('message', (message: MarkdownConversionResult) => {
      finalize(() => {
        if (message?.ok) {
          resolve(message.content);
          return;
        }
        reject(new Error(message?.error || `${label} markdown conversion failed`));
      });
    });

    child.once('error', (error) => {
      finalize(() => reject(error));
    });

    child.once('exit', (code) => {
      if (settled || code === 0) return;
      finalize(() => reject(new Error(`${label} markdown conversion worker exited with code ${code}`)));
    });

    child.send({ markdown });
  });
}
