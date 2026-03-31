import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../../services/ai-tools/registry.js';
import { z } from 'zod';

// Mock prisma to avoid DB calls in unit tests
vi.mock('../../config/database.js', () => ({
  prisma: {
    aiToolAudit: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve tools', () => {
    registry.register({
      name: 'testTool',
      description: 'A test tool',
      parameters: z.object({ input: z.string() }),
      contexts: ['project-chat'],
      execute: async () => ({ success: true, data: 'ok' }),
    });

    const tools = registry.getToolsForContext('project-chat', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(tools).toHaveProperty('testTool');
  });

  it('should filter tools by context', () => {
    registry.register({
      name: 'chatOnly',
      description: 'Chat only',
      parameters: z.object({}),
      contexts: ['project-chat'],
      execute: async () => ({ success: true }),
    });
    registry.register({
      name: 'globalOnly',
      description: 'Global only',
      parameters: z.object({}),
      contexts: ['global'],
      execute: async () => ({ success: true }),
    });

    const chatTools = registry.getToolsForContext('project-chat', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });
    const globalTools = registry.getToolsForContext('global', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(chatTools).toHaveProperty('chatOnly');
    expect(chatTools).not.toHaveProperty('globalOnly');
    expect(globalTools).toHaveProperty('globalOnly');
    expect(globalTools).not.toHaveProperty('chatOnly');
  });

  it('should execute tool and return result', async () => {
    registry.register({
      name: 'echo',
      description: 'Echo input',
      parameters: z.object({ msg: z.string() }),
      contexts: ['project-chat'],
      execute: async (params) => ({
        success: true,
        data: (params as { msg: string }).msg,
      }),
    });

    const result = await registry.execute('echo', { msg: 'hello' }, {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(result).toEqual({ success: true, data: 'hello' });
  });

  it('should return error for unknown tool', async () => {
    const result = await registry.execute('missing', {}, {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('should include tools available in multiple contexts', () => {
    registry.register({
      name: 'everywhere',
      description: 'Available everywhere',
      parameters: z.object({}),
      contexts: ['project-chat', 'global'],
      execute: async () => ({ success: true }),
    });

    const chatTools = registry.getToolsForContext('project-chat', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });
    const globalTools = registry.getToolsForContext('global', {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(chatTools).toHaveProperty('everywhere');
    expect(globalTools).toHaveProperty('everywhere');
  });

  it('should merge tools across multiple requested contexts', () => {
    registry.register({
      name: 'chatOnly',
      description: 'Chat only',
      parameters: z.object({}),
      contexts: ['project-chat'],
      execute: async () => ({ success: true }),
    });
    registry.register({
      name: 'globalOnly',
      description: 'Global only',
      parameters: z.object({}),
      contexts: ['global'],
      execute: async () => ({ success: true }),
    });
    registry.register({
      name: 'everywhere',
      description: 'Available everywhere',
      parameters: z.object({}),
      contexts: ['project-chat', 'global'],
      execute: async () => ({ success: true }),
    });

    const tools = registry.getToolsForContexts(['project-chat', 'global'], {
      userId: 'u1', projectId: 'p1', requestId: 'r1',
    });

    expect(tools).toHaveProperty('chatOnly');
    expect(tools).toHaveProperty('globalOnly');
    expect(tools).toHaveProperty('everywhere');
    expect(Object.keys(tools)).toHaveLength(3);
  });
});
