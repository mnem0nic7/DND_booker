import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export type OpenAiImageModel = 'dall-e-3' | 'gpt-image-1';
export type GoogleImageModel = 'gemini-2.5-flash-image' | 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';
export type ImageModel = OpenAiImageModel | GoogleImageModel;
export type ImageProvider = 'openai' | 'google';

const TEXTLESS_IMAGE_PROMPT_SUFFIX = 'No visible words, no letters, no typography, no captions, no labels, no logos, no watermark.';
const DEFAULT_OPENAI_IMAGE_MODEL: OpenAiImageModel = 'gpt-image-1';
const DEFAULT_GOOGLE_IMAGE_MODEL: GoogleImageModel = 'gemini-2.5-flash-image';
const OPENAI_IMAGE_MODELS: OpenAiImageModel[] = ['dall-e-3', 'gpt-image-1'];
const GOOGLE_IMAGE_MODELS: GoogleImageModel[] = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview'];

const ALLOWED_SIZES: Record<OpenAiImageModel, string[]> = {
  'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
  'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536'],
};

const GOOGLE_ASPECT_RATIO_BY_SIZE: Record<string, string> = {
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1024x1792': '9:16',
  '1536x1024': '3:2',
  '1792x1024': '16:9',
};

interface GenerateImageOptions {
  prompt: string;
  model: string;
  size: string;
  quality?: string;
  timeoutMs?: number;
  provider?: ImageProvider;
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

export function normalizeImageQuality(model: ImageModel, quality?: string): string | undefined {
  if (!quality) return undefined;
  const normalized = quality.trim().toLowerCase();
  if (!normalized) return undefined;

  if (model === 'gpt-image-1') {
    if (normalized === 'standard') return 'medium';
    if (['low', 'medium', 'high', 'auto'].includes(normalized)) {
      return normalized;
    }
    return undefined;
  }

  if (model === 'dall-e-3') {
    if (['standard', 'hd'].includes(normalized)) {
      return normalized;
    }
    return undefined;
  }

  return undefined;
}

export function isOpenAiImageModel(model: string): model is OpenAiImageModel {
  return OPENAI_IMAGE_MODELS.includes(model as OpenAiImageModel);
}

export function isGoogleImageModel(model: string): model is GoogleImageModel {
  return GOOGLE_IMAGE_MODELS.includes(model as GoogleImageModel);
}

export function resolveImageProvider(provider?: string, model?: string): ImageProvider {
  if (provider === 'google' || provider === 'openai') return provider;
  if (model && isGoogleImageModel(model)) return 'google';
  return 'openai';
}

export function normalizeImageModel(provider: ImageProvider, model?: string): ImageModel {
  if (provider === 'google') {
    return model && isGoogleImageModel(model) ? model : DEFAULT_GOOGLE_IMAGE_MODEL;
  }
  return model && isOpenAiImageModel(model) ? model : DEFAULT_OPENAI_IMAGE_MODEL;
}

export function normalizeImageSize(provider: ImageProvider, model: ImageModel, size: string): string {
  if (provider === 'google') {
    if (GOOGLE_ASPECT_RATIO_BY_SIZE[size]) return size;
    throw new Error(`Invalid size "${size}" for ${model}. Allowed: ${Object.keys(GOOGLE_ASPECT_RATIO_BY_SIZE).join(', ')}`);
  }

  const openAiModel = normalizeImageModel('openai', model) as OpenAiImageModel;
  const sizes = ALLOWED_SIZES[openAiModel];
  if (!sizes.includes(size)) {
    throw new Error(`Invalid size "${size}" for ${openAiModel}. Allowed: ${sizes.join(', ')}`);
  }
  return size;
}

function resolveGoogleAspectRatio(size: string): string {
  const aspectRatio = GOOGLE_ASPECT_RATIO_BY_SIZE[size];
  if (!aspectRatio) {
    throw new Error(`Invalid Gemini image size "${size}". Allowed: ${Object.keys(GOOGLE_ASPECT_RATIO_BY_SIZE).join(', ')}`);
  }
  return aspectRatio;
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
  const { prompt, model: rawModel, size: rawSize, quality, timeoutMs: explicitTimeoutMs } = options;
  const provider = resolveImageProvider(options.provider, rawModel);
  const model = normalizeImageModel(provider, rawModel);
  const size = normalizeImageSize(provider, model, rawSize);
  const sanitizedPrompt = sanitizeImagePrompt(prompt);
  const normalizedQuality = normalizeImageQuality(model, quality);

  const timeoutMs = explicitTimeoutMs && explicitTimeoutMs > 0
    ? explicitTimeoutMs
    : resolveImageTimeoutMs();

  if (provider === 'google') {
    return await withHardImageTimeout(timeoutMs, async (signal) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: sanitizedPrompt }],
            }],
            generationConfig: {
              responseModalities: ['IMAGE'],
              imageConfig: {
                aspectRatio: resolveGoogleAspectRatio(size),
              },
            },
          }),
          signal,
        },
      );

      const data = await response.json().catch(() => null) as
        | {
          error?: { message?: string };
          candidates?: Array<{
            content?: {
              parts?: Array<{
                inlineData?: { data?: string; mimeType?: string };
                inline_data?: { data?: string; mimeType?: string };
              }>;
            };
          }>;
        }
        | null;

      if (!response.ok) {
        throw new Error(data?.error?.message || `Gemini image generation failed with ${response.status}`);
      }

      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inlineData = part.inlineData ?? part.inline_data;
        if (inlineData?.data) {
          return {
            base64: inlineData.data,
            mimeType: inlineData.mimeType || 'image/png',
          };
        }
      }

      throw new Error('Gemini image generation returned no image data.');
    });
  }

  const openai = createOpenAI({ apiKey });
  const providerOptions: Record<string, Record<string, string>> = {};
  if (model === 'dall-e-3') {
    providerOptions.openai = { style: 'vivid', ...(normalizedQuality ? { quality: normalizedQuality } : {}) };
  } else if (normalizedQuality) {
    providerOptions.openai = { quality: normalizedQuality };
  }

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
