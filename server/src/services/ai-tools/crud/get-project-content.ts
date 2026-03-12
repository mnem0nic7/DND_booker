import { z } from 'zod';
import { getCanonicalProjectContent } from '../../project-document-content.service.js';
import type { ToolDefinition } from '../types.js';

export const getProjectContent: ToolDefinition = {
  name: 'getProjectContent',
  description:
    'Get the composed TipTap JSON content of the whole project across its documents. Use this to read the current editor state.',
  parameters: z.object({
    projectId: z.string().uuid().describe('The project ID whose content to retrieve'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { projectId } = params as { projectId: string };
    const snapshot = await getCanonicalProjectContent(projectId, ctx.userId);
    if (!snapshot) {
      return {
        success: false,
        error: { code: 'NOT_FOUND' as const, message: 'Project not found' },
      };
    }
    return {
      success: true,
      data: { content: snapshot.content, updatedAt: snapshot.updatedAt.toISOString() },
    };
  },
};
