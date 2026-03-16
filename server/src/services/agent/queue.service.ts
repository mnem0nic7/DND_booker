import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';

export interface AgentJobData {
  agentRunId: string;
  userId: string;
  projectId: string;
}

const agentQueue = new Queue('agent', {
  connection: redis as unknown as ConnectionOptions,
});

export async function enqueueAgentRun(agentRunId: string, userId: string, projectId: string) {
  const job = await agentQueue.add(
    'operate',
    { agentRunId, userId, projectId } satisfies AgentJobData,
    {
      attempts: 1,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );

  return job.id;
}
