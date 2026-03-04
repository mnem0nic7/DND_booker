import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

const operationSchema = z.object({
  op: z.enum(['insertBefore', 'insertAfter', 'remove', 'replace', 'updateAttrs']),
  nodeIndex: z.number().int().min(0),
  targetType: z.string().optional(),
  node: z.object({
    type: z.string(),
    attrs: z.record(z.unknown()).optional(),
    content: z.array(z.any()).optional(),
  }).optional(),
  attrs: z.record(z.unknown()).optional(),
});

export const editDocument: ToolDefinition = {
  name: 'editDocument',
  description: 'Apply structural edits to the document. Provide a list of operations (insert, remove, replace, updateAttrs) referencing nodes by index from the document outline. Operations are applied client-side to preserve undo history.',
  parameters: z.object({
    description: z.string().describe('Human-readable summary of what these edits do'),
    operations: z.array(operationSchema).min(1).max(50).describe('List of edit operations to apply'),
  }),
  contexts: ['project-chat'],
  execute: async (params) => {
    const { description, operations } = params as {
      description: string;
      operations: Array<{ op: string; nodeIndex: number; targetType?: string; node?: unknown; attrs?: unknown }>;
    };

    // Validate operation-specific requirements
    for (const op of operations) {
      if ((op.op === 'insertBefore' || op.op === 'insertAfter' || op.op === 'replace') && !op.node) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR' as const, message: `Operation "${op.op}" at index ${op.nodeIndex} requires a "node" field` },
        };
      }
      if (op.op === 'updateAttrs' && !op.attrs) {
        return {
          success: false,
          error: { code: 'VALIDATION_ERROR' as const, message: `Operation "updateAttrs" at index ${op.nodeIndex} requires an "attrs" field` },
        };
      }
    }

    return {
      success: true,
      data: { _documentEdit: true, description, operations, operationCount: operations.length },
    };
  },
};
