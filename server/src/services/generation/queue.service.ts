import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';

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
): Promise<string | undefined> {
  const job = await generationQueue.add(
    'orchestrate',
    { runId, userId, projectId } satisfies GenerationJobData,
    {
      attempts: 1,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
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
