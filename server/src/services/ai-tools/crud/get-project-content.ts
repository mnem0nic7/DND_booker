import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const getProjectContent: ToolDefinition = {
  name: 'getProjectContent',
  description:
    'Get the TipTap JSON content of a project document. Use this to read what is currently in the editor.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID whose content to retrieve'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { projectId } = params as { projectId: string };
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: ctx.userId },
      select: { id: true, content: true, updatedAt: true },
    });
    if (!project) {
      return {
        success: false,
        error: { code: 'NOT_FOUND' as const, message: 'Project not found' },
      };
    }
    return {
      success: true,
      data: { content: project.content, updatedAt: project.updatedAt.toISOString() },
    };
  },
};
