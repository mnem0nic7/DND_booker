import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';
import { resolveQueueDispatchOptions, type QueueDispatchOverrides } from '../queue/config.js';

export interface AgentJobData {
  agentRunId: string;
  userId: string;
  projectId: string;
}

const agentQueue = new Queue('agent', {
  connection: redis as unknown as ConnectionOptions,
});

export async function enqueueAgentRun(
  agentRunId: string,
  userId: string,
  projectId: string,
  overrides: QueueDispatchOverrides = {},
) {
  const dispatchOptions = resolveQueueDispatchOptions('agent', overrides);
  const job = await agentQueue.add(
    'operate',
    { agentRunId, userId, projectId } satisfies AgentJobData,
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
