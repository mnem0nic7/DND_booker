import { generateImage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export type ImageModel = 'dall-e-3' | 'gpt-image-1';

const ALLOWED_SIZES: Record<ImageModel, string[]> = {
  'dall-e-3': ['1024x1024', '1792x1024', '1024x1792'],
  'gpt-image-1': ['1024x1024', '1536x1024', '1024x1536'],
};

interface GenerateImageOptions {
  prompt: string;
  model: ImageModel;
  size: string;
  quality?: string;
}

const DEFAULT_IMAGE_TIMEOUT_MS = 180_000;

function resolveImageTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.AI_IMAGE_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_IMAGE_TIMEOUT_MS;
}

export async function generateAiImage(
  apiKey: string,
  options: GenerateImageOptions,
): Promise<{ base64: string; mimeType: string }> {
  const { prompt, model, size, quality } = options;

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

  const timeoutMs = resolveImageTimeoutMs();
  let image;
  try {
    ({ image } = await generateImage({
      model: openai.image(model),
      prompt,
      size: size as `${number}x${number}`,
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      abortSignal: AbortSignal.timeout(timeoutMs),
    }));
  } catch (error) {
    if (error instanceof Error && (
      error.name === 'AbortError'
      || error.name === 'TimeoutError'
      || /aborted|timeout/i.test(error.message)
    )) {
      throw new Error(`Image generation timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  }

  return {
    base64: image.base64,
    mimeType: 'image/png',
  };
}
