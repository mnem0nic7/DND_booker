import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';
import { resolveQueueDispatchOptions, type QueueDispatchOverrides } from '../queue/config.js';

export interface ImprovementLoopJobData {
  runId: string;
  userId: string;
  projectId: string;
}

const queue = new Queue('improvement-loop', {
  connection: redis as unknown as ConnectionOptions,
});

export async function enqueueImprovementLoopRun(
  runId: string,
  userId: string,
  projectId: string,
  overrides: QueueDispatchOverrides = {},
) {
  const dispatchOptions = resolveQueueDispatchOptions('improvement-loop', overrides);
  const job = await queue.add(
    'operate',
    { runId, userId, projectId } satisfies ImprovementLoopJobData,
    {
      attempts: dispatchOptions.attempts,
      priority: dispatchOptions.priority,
      removeOnComplete: dispatchOptions.removeOnComplete,
      removeOnFail: dispatchOptions.removeOnFail,
      ...(dispatchOptions.backoff ? { backoff: dispatchOptions.backoff } : {}),
    },
  );

  return job.id;
}
