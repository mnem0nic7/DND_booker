import { describe, expect, it } from 'vitest';
import { readPendingGraphInterrupts } from './graphInterrupts';

describe('readPendingGraphInterrupts', () => {
  it('normalizes persisted interrupt objects into pending graph interrupts', () => {
    const interrupts = readPendingGraphInterrupts({
      interrupts: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'manual_review',
          status: 'pending',
          createdAt: '2026-04-01T16:00:00.000Z',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'approval_gate',
          status: 'approved',
          createdAt: '2026-04-01T16:05:00.000Z',
        },
      ],
    }, 'generation', 'run-1');

    expect(interrupts).toHaveLength(1);
    expect(interrupts[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      runType: 'generation',
      runId: 'run-1',
      kind: 'manual_review',
      title: 'manual review',
      status: 'pending',
    });
  });
});
