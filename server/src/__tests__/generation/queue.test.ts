import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ before importing the module
const mockAdd = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'mock-job-id' }));
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: vi.fn(),
  })),
}));

// Mock Redis
vi.mock('../../config/redis.js', () => ({
  redis: {},
}));

import { enqueueGenerationRun } from '../../services/generation/queue.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Generation Queue Service', () => {
  it('enqueues a generation run with correct data', async () => {
    const jobId = await enqueueGenerationRun('run-123', 'user-456', 'proj-789');

    expect(jobId).toBe('mock-job-id');
    // Lock in the generation queue's reliability config: BullMQ retries with
    // exponential backoff (not a single attempt) so transient failures during
    // a multi-stage run resume instead of dying. See QUEUE_DEFAULTS.generation.
    expect(mockAdd).toHaveBeenCalledWith(
      'orchestrate',
      { runId: 'run-123', userId: 'user-456', projectId: 'proj-789' },
      expect.objectContaining({
        attempts: 3,
        priority: 20,
        backoff: { type: 'exponential', delay: 2500 },
      }),
    );
  });
});
