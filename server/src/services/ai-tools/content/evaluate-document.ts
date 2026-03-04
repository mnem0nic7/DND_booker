import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

const findingSchema = z.object({
  category: z.enum(['content', 'formatting', 'layout']),
  severity: z.enum(['issue', 'suggestion', 'praise']),
  nodeRef: z.number().int().default(-1).describe('Node index reference, -1 for general'),
  title: z.string(),
  detail: z.string(),
});

export const evaluateDocument: ToolDefinition = {
  name: 'evaluateDocument',
  description: 'Submit a structured document evaluation. Include an overall score (0-10), summary, and detailed findings across content, formatting, and layout categories.',
  parameters: z.object({
    overallScore: z.number().min(0).max(10).describe('Overall quality score 0-10'),
    summary: z.string().describe('2-3 sentence evaluation summary'),
    findings: z.array(findingSchema).min(1).max(20).describe('Detailed findings'),
  }),
  contexts: ['project-chat'],
  execute: async (params) => {
    const { overallScore, summary, findings } = params as {
      overallScore: number; summary: string; findings: Array<{
        category: string; severity: string; nodeRef: number; title: string; detail: string;
      }>;
    };

    return {
      success: true,
      data: { _evaluation: true, overallScore, summary, findings },
    };
  },
};
