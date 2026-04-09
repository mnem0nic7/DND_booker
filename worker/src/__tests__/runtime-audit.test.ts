import { describe, expect, it, vi } from 'vitest';
import { runRuntimeAudit, type QueueBacklogSummary } from '../runtime-audit.js';

function createPrismaStub() {
  return {
    generationRun: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    agentRun: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    exportJob: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe('runtime-audit', () => {
  it('flags stale queue backlog when the oldest queued job exceeds the configured threshold', async () => {
    const prismaStub = createPrismaStub();
    const inspectQueueBacklogs = vi.fn<() => Promise<QueueBacklogSummary[]>>().mockResolvedValue([
      {
        queueName: 'generation',
        waitingCount: 2,
        delayedCount: 0,
        prioritizedCount: 1,
        waitingChildrenCount: 0,
        activeCount: 0,
        totalQueuedCount: 3,
        oldestQueuedAt: '2026-04-09T00:00:00.000Z',
        oldestQueuedAgeMinutes: 21,
      },
      {
        queueName: 'export',
        waitingCount: 1,
        delayedCount: 0,
        prioritizedCount: 0,
        waitingChildrenCount: 0,
        activeCount: 0,
        totalQueuedCount: 1,
        oldestQueuedAt: '2026-04-09T00:11:00.000Z',
        oldestQueuedAgeMinutes: 4,
      },
      {
        queueName: 'agent',
        waitingCount: 0,
        delayedCount: 0,
        prioritizedCount: 0,
        waitingChildrenCount: 0,
        activeCount: 1,
        totalQueuedCount: 0,
        oldestQueuedAt: null,
        oldestQueuedAgeMinutes: null,
      },
    ]);

    const summary = await runRuntimeAudit(
      {
        queuedGenerationMinutes: 15,
        queuedAgentMinutes: 15,
        queuedExportMinutes: 15,
        pendingInterruptMinutes: 20,
        queueGenerationMinutes: 15,
        queueAgentMinutes: 15,
        queueExportMinutes: 10,
      },
      {
        prismaClient: prismaStub as any,
        inspectQueueBacklogs,
      },
    );

    expect(summary.staleQueueBacklogs).toBe(1);
    expect(summary.violations).toContain('stale generation queue backlog: 3 queued, oldest 21m');
    expect(summary.queueBacklogs[0]?.queueName).toBe('generation');
  });

  it('does not flag queue backlog below the configured thresholds', async () => {
    const prismaStub = createPrismaStub();
    const inspectQueueBacklogs = vi.fn<() => Promise<QueueBacklogSummary[]>>().mockResolvedValue([
      {
        queueName: 'generation',
        waitingCount: 1,
        delayedCount: 0,
        prioritizedCount: 0,
        waitingChildrenCount: 0,
        activeCount: 0,
        totalQueuedCount: 1,
        oldestQueuedAt: '2026-04-09T00:12:00.000Z',
        oldestQueuedAgeMinutes: 3,
      },
      {
        queueName: 'export',
        waitingCount: 0,
        delayedCount: 0,
        prioritizedCount: 0,
        waitingChildrenCount: 0,
        activeCount: 0,
        totalQueuedCount: 0,
        oldestQueuedAt: null,
        oldestQueuedAgeMinutes: null,
      },
      {
        queueName: 'agent',
        waitingCount: 0,
        delayedCount: 0,
        prioritizedCount: 0,
        waitingChildrenCount: 0,
        activeCount: 0,
        totalQueuedCount: 0,
        oldestQueuedAt: null,
        oldestQueuedAgeMinutes: null,
      },
    ]);

    const summary = await runRuntimeAudit(
      {
        queuedGenerationMinutes: 15,
        queuedAgentMinutes: 15,
        queuedExportMinutes: 15,
        pendingInterruptMinutes: 20,
        queueGenerationMinutes: 15,
        queueAgentMinutes: 15,
        queueExportMinutes: 10,
      },
      {
        prismaClient: prismaStub as any,
        inspectQueueBacklogs,
      },
    );

    expect(summary.staleQueueBacklogs).toBe(0);
    expect(summary.violations).toEqual([]);
  });
});
