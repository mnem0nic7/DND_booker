import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../services/ai-tools/types.js';

const mockCreateRun = vi.hoisted(() => vi.fn());
const mockEnqueue = vi.hoisted(() => vi.fn());

vi.mock('../../services/generation/run.service.js', () => ({
  createRun: mockCreateRun,
}));

vi.mock('../../services/generation/queue.service.js', () => ({
  enqueueGenerationRun: mockEnqueue,
}));

import { startGenerationRun } from '../../services/ai-tools/content/start-generation-run.js';

const ctx: ToolContext = { userId: 'user-1', projectId: 'proj-1', requestId: 'req-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startGenerationRun tool', () => {
  it('creates a run and enqueues it', async () => {
    mockCreateRun.mockResolvedValue({
      id: 'run-abc',
      projectId: 'proj-1',
      userId: 'user-1',
      status: 'queued',
    });
    mockEnqueue.mockResolvedValue('job-123');

    const result = await startGenerationRun.execute(
      { prompt: 'A dark forest adventure', mode: 'one_shot', quality: 'quick' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect((result.data as any).runId).toBe('run-abc');
    expect((result.data as any).jobId).toBe('job-123');

    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      userId: 'user-1',
      prompt: 'A dark forest adventure',
      mode: 'one_shot',
      quality: 'quick',
    }));
    expect(mockEnqueue).toHaveBeenCalledWith('run-abc', 'user-1', 'proj-1');
  });

  it('returns NOT_FOUND when project does not exist', async () => {
    mockCreateRun.mockResolvedValue(null);

    const result = await startGenerationRun.execute(
      { prompt: 'test', mode: 'one_shot', quality: 'quick' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('has correct context scope', () => {
    expect(startGenerationRun.contexts).toContain('project-chat');
  });
});
