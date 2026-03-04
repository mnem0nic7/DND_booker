import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const updateProjectContent: ToolDefinition = {
  name: 'updateProjectContent',
  description: 'Replace the entire TipTap JSON content of a project document. Requires expectedUpdatedAt for concurrency safety.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID whose content to update'),
    expectedUpdatedAt: z.string().describe('ISO timestamp from last read'),
    content: z.object({
      type: z.string(),
      content: z.array(z.any()).optional(),
    }).describe('TipTap JSON document content'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt, content } = params as {
      projectId: string; expectedUpdatedAt: string; content: unknown;
    };

    const current = await prisma.project.findFirst({ where: { id: projectId, userId: ctx.userId } });
    if (!current) {
      return { success: false, error: { code: 'NOT_FOUND' as const, message: 'Project not found' } };
    }
    if (current.updatedAt.toISOString() !== expectedUpdatedAt) {
      return { success: false, error: { code: 'CONFLICT' as const, message: 'Project modified since last read' } };
    }

    const contentStr = JSON.stringify(content);
    if (contentStr.length > 5_000_000) {
      return { success: false, error: { code: 'VALIDATION_ERROR' as const, message: 'Content exceeds 5 MB limit' } };
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { content: content as Prisma.InputJsonValue },
    });
    return { success: true, data: { id: updated.id, updatedAt: updated.updatedAt.toISOString() } };
  },
};
