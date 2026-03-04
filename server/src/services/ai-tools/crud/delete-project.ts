import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const deleteProject: ToolDefinition = {
  name: 'deleteProject',
  description: 'Delete a project. Requires expectedUpdatedAt for safety. This action is irreversible.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID to delete'),
    expectedUpdatedAt: z.string().describe('ISO timestamp from last read'),
  }),
  contexts: ['global'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt } = params as { projectId: string; expectedUpdatedAt: string };

    const current = await prisma.project.findFirst({ where: { id: projectId, userId: ctx.userId } });
    if (!current) {
      return { success: false, error: { code: 'NOT_FOUND' as const, message: 'Project not found' } };
    }
    if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
      return { success: false, error: { code: 'CONFLICT' as const, message: 'Project modified since last read' } };
    }

    await prisma.project.delete({ where: { id: projectId } });
    return { success: true, data: { deleted: true, id: projectId } };
  },
};
