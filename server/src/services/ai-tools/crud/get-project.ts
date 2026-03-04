import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const getProject: ToolDefinition = {
  name: 'getProject',
  description:
    'Get full metadata for a specific project. Returns all project fields except content.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID to retrieve'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { projectId } = params as { projectId: string };
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: ctx.userId },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        status: true,
        coverImageUrl: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!project) {
      return {
        success: false,
        error: { code: 'NOT_FOUND' as const, message: 'Project not found' },
      };
    }
    return { success: true, data: project };
  },
};
