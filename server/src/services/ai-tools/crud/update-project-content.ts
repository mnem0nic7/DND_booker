import { z } from 'zod';
import { saveCanonicalProjectContent } from '../../project-document-content.service.js';
import type { ToolDefinition } from '../types.js';

export const updateProjectContent: ToolDefinition = {
  name: 'updateProjectContent',
  description: 'Replace the entire TipTap JSON content of a project. The server will split the result back into separate project documents. Requires expectedUpdatedAt for concurrency safety.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID whose content to update'),
    expectedUpdatedAt: z.string().describe('ISO timestamp from last read'),
    content: z.object({
      type: z.string(),
      content: z.array(z.record(z.string(), z.unknown())).optional(),
    }).describe('TipTap JSON document content'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { projectId, expectedUpdatedAt, content } = params as {
      projectId: string; expectedUpdatedAt: string; content: unknown;
    };

    const contentStr = JSON.stringify(content);
    if (contentStr.length > 5_000_000) {
      return { success: false, error: { code: 'VALIDATION_ERROR' as const, message: 'Content exceeds 5 MB limit' } };
    }

    const result = await saveCanonicalProjectContent(projectId, ctx.userId, content, expectedUpdatedAt);
    if (result.status === 'not_found') {
      return { success: false, error: { code: 'NOT_FOUND' as const, message: 'Project not found' } };
    }
    if (result.status === 'conflict') {
      return { success: false, error: { code: 'CONFLICT' as const, message: 'Project modified since last read' } };
    }

    return { success: true, data: { id: result.project.id, updatedAt: result.updatedAt.toISOString() } };
  },
};
