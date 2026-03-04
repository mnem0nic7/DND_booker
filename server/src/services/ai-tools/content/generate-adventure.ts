import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

const sectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  blockHints: z.array(z.string()).default([]),
  sortOrder: z.number().int().min(0),
});

export const generateAdventure: ToolDefinition = {
  name: 'generateAdventure',
  description: 'Generate an adventure outline that triggers the wizard flow. The user can then select which sections to generate content for.',
  parameters: z.object({
    adventureTitle: z.string().describe('Title for the adventure'),
    summary: z.string().describe('2-3 sentence adventure summary'),
    sections: z.array(sectionSchema).min(1).max(20).describe('Adventure sections in order'),
  }),
  contexts: ['project-chat'],
  execute: async (params) => {
    const { adventureTitle, summary, sections } = params as {
      adventureTitle: string; summary: string;
      sections: Array<{ id: string; title: string; description: string; blockHints: string[]; sortOrder: number }>;
    };

    return {
      success: true,
      data: { _wizardGenerate: true, adventureTitle, summary, sections },
    };
  },
};
