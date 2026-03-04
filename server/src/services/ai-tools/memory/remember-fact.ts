import { z } from 'zod';
import * as aiMemory from '../../ai-memory.service.js';
import type { ToolDefinition } from '../types.js';

const VALID_TYPES = ['preference', 'project_fact', 'constraint', 'decision', 'glossary'] as const;

export const rememberFact: ToolDefinition = {
  name: 'rememberFact',
  description: 'Store a long-term memory fact. Use for user preferences, project facts, constraints, decisions, or glossary terms. Scope "project" stores against current project, "global" applies across all projects.',
  parameters: z.object({
    type: z.enum(VALID_TYPES).describe('Category of the memory item'),
    content: z.string().min(1).max(2000).describe('The fact to remember'),
    scope: z.enum(['project', 'global']).default('project').describe('Whether this applies to the current project or globally'),
  }),
  contexts: ['project-chat', 'global'],
  execute: async (params, ctx) => {
    const { type, content, scope } = params as {
      type: string; content: string; scope: 'project' | 'global';
    };

    const item = await aiMemory.addMemoryItem(ctx.userId, {
      type,
      content: content.trim(),
      projectId: scope === 'global' ? null : ctx.projectId,
      source: 'ai-chat',
    });

    return { success: true, data: { id: item.id, type: item.type } };
  },
};
