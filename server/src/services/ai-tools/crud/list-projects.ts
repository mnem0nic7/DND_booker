import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const listProjects: ToolDefinition = {
  name: 'listProjects',
  description:
    'List all projects belonging to the current user. Returns id, title, type, status, and updatedAt for each project.',
  parameters: z.object({}),
  contexts: ['project-chat', 'global'],
  execute: async (_params, ctx) => {
    const projects = await prisma.project.findMany({
      where: { userId: ctx.userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, type: true, status: true, updatedAt: true },
    });
    return { success: true, data: projects };
  },
};
