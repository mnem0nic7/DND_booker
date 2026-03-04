import { z } from 'zod';
import * as aiMemory from '../../ai-memory.service.js';
import type { ToolDefinition } from '../types.js';

const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional().default(''),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']).default('pending'),
  dependsOn: z.array(z.string()).default([]),
  acceptanceCriteria: z.string().optional(),
  notes: z.string().optional(),
});

export const updateTaskPlan: ToolDefinition = {
  name: 'updateTaskPlan',
  description: 'Replace the entire task plan for this project. Provide the full list of tasks — this is not a merge, it fully replaces. Max 50 tasks.',
  parameters: z.object({
    tasks: z.array(taskSchema).max(50).describe('Full list of plan tasks'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { tasks } = params as { tasks: Array<{
      id: string; title: string; description?: string;
      status?: string; dependsOn?: string[];
      acceptanceCriteria?: unknown; notes?: string;
    }> };

    const validTasks = tasks
      .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        status: (['pending', 'in_progress', 'done', 'blocked'].includes(t.status || '')
          ? t.status
          : 'pending') as 'pending' | 'in_progress' | 'done' | 'blocked',
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
        acceptanceCriteria: typeof t.acceptanceCriteria === 'string' ? t.acceptanceCriteria : undefined,
        notes: t.notes,
      }));

    await aiMemory.saveTaskPlan(ctx.projectId, ctx.userId, validTasks);
    return { success: true, data: { taskCount: validTasks.length } };
  },
};
