import { tool, type Tool } from 'ai';
import { createHash } from 'crypto';
import type { ToolContext, ToolResult, ToolDefinition } from './types.js';
import { prisma } from '../../config/database.js';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition): void {
    this.tools.set(def.name, def);
  }

  /** Get Vercel AI SDK tool definitions filtered by context. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getToolsForContext(context: string, ctx: ToolContext): Record<string, Tool<any, any>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, Tool<any, any>> = {};

    for (const [name, def] of this.tools) {
      if (!def.contexts.includes(context as ToolDefinition['contexts'][number])) continue;

      result[name] = tool({
        description: def.description,
        inputSchema: def.parameters,
        execute: async (params: unknown) => {
          return this.executeWithAudit(name, params, ctx);
        },
      });
    }

    return result;
  }

  /** Execute a tool directly (for testing or non-streaming use). */
  async execute(name: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const def = this.tools.get(name);
    if (!def) {
      return { success: false, error: { code: 'NOT_FOUND', message: `Unknown tool: ${name}` } };
    }
    return def.execute(params, ctx);
  }

  /** Execute with timing and audit logging. */
  private async executeWithAudit(name: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const start = Date.now();
    let result: ToolResult;

    try {
      result = await this.execute(name, params, ctx);
    } catch (err) {
      result = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }

    const latencyMs = Date.now() - start;

    // Fire-and-forget audit write
    this.writeAudit(name, params, result, ctx, latencyMs).catch((err) => {
      console.error(`[ToolRegistry] Audit write failed for ${name}:`, err);
    });

    return result;
  }

  private async writeAudit(
    toolName: string,
    params: unknown,
    result: ToolResult,
    ctx: ToolContext,
    latencyMs: number,
  ): Promise<void> {
    const inputHash = createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);

    await prisma.aiToolAudit.create({
      data: {
        requestId: ctx.requestId,
        userId: ctx.userId,
        projectId: ctx.projectId || null,
        toolName,
        inputHash,
        resultStatus: result.success ? 'success' : (result.error?.code ?? 'error'),
        latencyMs,
      },
    });
  }
}
