import type { z } from 'zod';
import type { ToolContext, ToolResult, ToolScope } from '@dnd-booker/shared';

export type { ToolContext, ToolResult, ToolScope };

/** A tool definition that the registry manages. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  contexts: ToolScope[];
  execute: (params: unknown, ctx: ToolContext) => Promise<ToolResult>;
}
