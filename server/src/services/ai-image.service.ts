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

  const { image } = await generateImage({
    model: openai.image(model),
    prompt,
    size: size as `${number}x${number}`,
    ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
  });

  return {
    base64: image.base64,
    mimeType: 'image/png',
  };
}
