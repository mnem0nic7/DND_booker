import { z } from 'zod';
import * as aiMemory from '../../ai-memory.service.js';
import type { ToolDefinition } from '../types.js';

export const updateWorkingMemory: ToolDefinition = {
  name: 'updateWorkingMemory',
  description: 'Update the rolling working memory for this project. Add new bullet points summarizing key facts, or drop obsolete ones by index. Max 20 bullets.',
  parameters: z.object({
    add: z.array(z.string().max(500)).optional().describe('New bullet points to append'),
    drop: z.array(z.number().int().min(0)).optional().describe('Indices of bullets to remove (0-based)'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { add, drop } = params as { add?: string[]; drop?: number[] };

    let bullets = await aiMemory.getWorkingMemory(ctx.projectId, ctx.userId);

    // Drop in reverse order to maintain index validity
    if (drop && Array.isArray(drop)) {
      const sorted = [...drop]
        .filter((i) => typeof i === 'number' && i >= 0 && i < bullets.length)
        .sort((a, b) => b - a);
      for (const idx of sorted) {
        bullets.splice(idx, 1);
      }
    }

    // Add new bullets
    if (add && Array.isArray(add)) {
      const newBullets = add.filter((b): b is string => typeof b === 'string');
      bullets = [...bullets, ...newBullets];
    }

    await aiMemory.saveWorkingMemory(ctx.projectId, ctx.userId, bullets);
    return { success: true, data: { bulletCount: bullets.length } };
  },
};
