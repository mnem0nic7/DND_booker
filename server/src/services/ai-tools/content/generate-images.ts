import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

const targetUpdateSchema = z.object({
  nodeIndex: z.number().int().min(0),
  attr: z.string(),
});

const targetInsertSchema = z.object({
  insertAfter: z.number().int().min(0),
  blockType: z.string(),
  attr: z.string(),
});

const imageRequestSchema = z.object({
  id: z.string(),
  prompt: z.string().min(10).max(4000).describe('Detailed image generation prompt'),
  model: z.string().min(1).default('gpt-image-1'),
  size: z.string().default('1024x1024'),
  target: z.union([targetUpdateSchema, targetInsertSchema]).describe('Where to place the generated image'),
});

export const generateImages: ToolDefinition = {
  name: 'generateImages',
  description: 'Queue image generation requests. Each image needs a descriptive prompt, model choice, size, and a target specifying where in the document to place the result. Max 4 images per call.',
  parameters: z.object({
    images: z.array(imageRequestSchema).min(1).max(4).describe('Image generation requests'),
  }),
  contexts: ['project-chat'],
  execute: async (params) => {
    const { images } = params as {
      images: Array<{
        id: string; prompt: string; model: string; size: string;
        target: { nodeIndex?: number; attr?: string; insertAfter?: number; blockType?: string };
      }>;
    };

    return {
      success: true,
      data: { _generateImage: true, images },
    };
  },
};
