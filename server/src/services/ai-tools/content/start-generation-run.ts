import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { createRun } from '../../generation/run.service.js';
import { enqueueGenerationRun } from '../../generation/queue.service.js';

export const startGenerationRun: ToolDefinition = {
  name: 'startGenerationRun',
  description: 'Start an autonomous campaign/adventure generation run. This creates a background job that generates a full campaign bible, chapter outline, entity dossiers, chapter drafts, and assembles them into project documents. Use this when the user wants to generate a complete adventure, campaign, or sourcebook.',
  parameters: z.object({
    prompt: z.string().describe('The user\'s description of what to generate (campaign concept, setting, themes, etc.)'),
    mode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']).default('one_shot').describe('Type of content to generate'),
    quality: z.enum(['quick', 'polished']).default('quick').describe('Generation quality — quick for fast drafts, polished for publication-ready'),
    pageTarget: z.number().int().min(5).max(500).optional().describe('Target page count for the output'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { prompt, mode, quality, pageTarget } = params as {
      prompt: string;
      mode: 'one_shot' | 'module' | 'campaign' | 'sourcebook';
      quality: 'quick' | 'polished';
      pageTarget?: number;
    };

    const run = await createRun({
      projectId: ctx.projectId,
      userId: ctx.userId,
      prompt,
      mode,
      quality,
      pageTarget,
    });

    if (!run) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found or access denied' },
      };
    }

    const jobId = await enqueueGenerationRun(run.id, ctx.userId, ctx.projectId);

    return {
      success: true,
      data: {
        runId: run.id,
        jobId,
        status: run.status,
        message: `Generation run started. I'll generate a ${mode} based on your description. You can monitor progress in the generation panel.`,
      },
    };
  },
};
