import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const updateProject: ToolDefinition = {
  name: 'updateProject',
  description: 'Update project metadata (title, description, type, status). Requires expectedUpdatedAt for concurrency safety.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID to update'),
    expectedUpdatedAt: z.string().describe('ISO timestamp from last read — prevents concurrent overwrites'),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional(),
    status: z.enum(['draft', 'in_progress', 'review', 'published']).optional(),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt, ...patch } = params as {
      projectId: string; expectedUpdatedAt: string;
      title?: string; description?: string; type?: string; status?: string;
    };

    const current = await prisma.project.findFirst({ where: { id: projectId, userId: ctx.userId } });
    if (!current) {
      return { success: false, error: { code: 'NOT_FOUND' as const, message: 'Project not found' } };
    }
    if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
      return { success: false, error: { code: 'CONFLICT' as const, message: 'Project modified since last read. Re-read and try again.' } };
    }

    const data: Record<string, unknown> = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.status !== undefined) data.status = patch.status;

    const updated = await prisma.project.update({ where: { id: projectId }, data });
    return { success: true, data: { id: updated.id, updatedAt: updated.updatedAt.toISOString() } };
  },
};
