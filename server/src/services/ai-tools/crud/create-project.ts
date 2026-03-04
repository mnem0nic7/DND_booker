import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import type { ToolDefinition } from '../types.js';

export const createProject: ToolDefinition = {
  name: 'createProject',
  description: 'Create a new project for the user. Returns the new project ID and updatedAt timestamp.',
  parameters: z.object({
    title: z.string().min(1).max(200).describe('Project title'),
    description: z.string().max(2000).optional().describe('Project description'),
    type: z.enum(['campaign', 'one_shot', 'supplement', 'sourcebook']).optional().describe('Project type'),
    templateId: z.string().uuid().optional().describe('Template ID to use as starting content'),
  }),
  contexts: ['global'],
  execute: async (params, ctx) => {
    const { title, description, type, templateId } = params as {
      title: string; description?: string; type?: string; templateId?: string;
    };

    let templateContent: unknown = null;
    let resolvedType = type || 'campaign';
    if (templateId) {
      const template = await prisma.template.findUnique({ where: { id: templateId } });
      if (template) {
        templateContent = template.content;
        if (!type) resolvedType = template.type;
      }
    }

    const project = await prisma.project.create({
      data: {
        userId: ctx.userId,
        title,
        description: description || '',
        type: resolvedType as any,
        settings: { pageSize: 'letter', margins: { top: 1, right: 1, bottom: 1, left: 1 }, columns: 1, theme: 'classic-parchment', fonts: { heading: 'Cinzel', body: 'Crimson Text' } },
        content: (templateContent as any) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      select: { id: true, title: true, type: true, updatedAt: true },
    });

    return { success: true, data: { ...project, updatedAt: project.updatedAt.toISOString() } };
  },
};
