import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';
import { resolveQueueDispatchOptions, type QueueDispatchOverrides } from '../queue/config.js';

export interface GenerationJobData {
  runId: string;
  userId: string;
  projectId: string;
}

const generationQueue = new Queue('generation', {
  connection: redis as unknown as ConnectionOptions,
});

/**
 * Enqueue a generation run for background processing.
 */
export async function enqueueGenerationRun(
  runId: string,
  userId: string,
  projectId: string,
  overrides: QueueDispatchOverrides = {},
): Promise<string | undefined> {
  const dispatchOptions = resolveQueueDispatchOptions('generation', overrides);
  const job = await generationQueue.add(
    'orchestrate',
    { runId, userId, projectId } satisfies GenerationJobData,
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

/**
 * Close the generation queue connection (for graceful shutdown).
 */
export async function closeGenerationQueue(): Promise<void> {
  await generationQueue.close();
}
