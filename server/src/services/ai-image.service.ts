import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export type ImageModel = 'dall-e-3' | 'gpt-image-1';

const TEXTLESS_IMAGE_PROMPT_SUFFIX = 'No visible words, no letters, no typography, no captions, no labels, no logos, no watermark.';

const ALLOWED_SIZES: Record<ImageModel, string[]> = {
  'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
  'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536'],
};

interface GenerateImageOptions {
  prompt: string;
  model: ImageModel;
  size: string;
  quality?: string;
  timeoutMs?: number;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 90_000;

function buildImageTimeoutError(timeoutMs: number): Error {
  return new Error(`Image generation timed out after ${Math.round(timeoutMs / 1000)}s`);
}

export function stripImageTextRenderingInstructions(value: string): string {
  return value
    .replace(/\b(the\s+)?title\s+(is|should be|appears|appearing|displayed|written|reads?)\b[^.?!]*[.?!]?/gi, ' ')
    .replace(/\b(display|show|include|render|add|put|write)\s+(the\s+)?(title|text|caption|quote|slogan|label|labels|words|lettering|typography|logo|watermark)\b[^.?!]*[.?!]?/gi, ' ')
    .replace(/\b(text|words)\s+(that\s+)?(read|reads|say|says|stating?)\b[^.?!]*[.?!]?/gi, ' ')
    .replace(/\b(mystical|ornate|decorative|stylized)\s+font\b[^.?!]*[.?!]?/gi, ' ')
    .replace(/\b(lettering|typography|caption|quote|slogan|label|labels|logo|watermark)\b[^.?!]*[.?!]?/gi, ' ');
}

export function sanitizeImagePrompt(prompt: string): string {
  const cleaned = stripImageTextRenderingInstructions(String(prompt ?? ''))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.?!,;:])/g, '$1')
    .trim()
    .replace(/[.;,\s]+$/g, '');

  return [
    cleaned,
    TEXTLESS_IMAGE_PROMPT_SUFFIX,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveImageTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_IMAGE_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_IMAGE_TIMEOUT_MS;
}

function isAbortLikeImageError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /aborted|timeout/i.test(error.message);
}

async function withHardImageTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  return await new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(buildImageTimeoutError(timeoutMs));
    }, timeoutMs);

    task(controller.signal)
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        if (isAbortLikeImageError(error)) {
          reject(buildImageTimeoutError(timeoutMs));
          return;
        }
        reject(error);
      });
  });
}

export async function generateAiImage(
  apiKey: string,
  options: GenerateImageOptions,
): Promise<{ base64: string; mimeType: string }> {
  const { prompt, model, size, quality, timeoutMs: explicitTimeoutMs } = options;
  const sanitizedPrompt = sanitizeImagePrompt(prompt);

  const sizes = ALLOWED_SIZES[model];
  if (!sizes.includes(size)) {
    throw new Error(`Invalid size "${size}" for ${model}. Allowed: ${sizes.join(', ')}`);
  }

  const openai = createOpenAI({ apiKey });

  const providerOptions: Record<string, Record<string, string>> = {};
  if (model === 'dall-e-3') {
    providerOptions.openai = { style: 'vivid', ...(quality ? { quality } : {}) };
  } else if (quality) {
    providerOptions.openai = { quality };
  }

  const timeoutMs = explicitTimeoutMs && explicitTimeoutMs > 0
    ? explicitTimeoutMs
    : resolveImageTimeoutMs();
  const image = await withHardImageTimeout(timeoutMs, async (signal) => {
    const result = await generateImage({
      model: openai.image(model),
      prompt: sanitizedPrompt,
      size: size as `${number}x${number}`,
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      abortSignal: signal,
    });
    return result.image;
  });

  return {
    base64: image.base64,
    mimeType: 'image/png',
  };
}
