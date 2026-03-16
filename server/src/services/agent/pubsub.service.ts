import IORedis from 'ioredis';
import type { AgentEvent } from '@dnd-booker/shared';

export const AGENT_CHANNEL_PREFIX = 'agent:run:';

function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export async function publishAgentEvent(runId: string, event: AgentEvent) {
  const { redis } = await import('../../config/redis.js');
  await redis.publish(`${AGENT_CHANNEL_PREFIX}${runId}`, JSON.stringify(event));
}

export async function subscribeToAgentRun(runId: string, onEvent: (event: AgentEvent) => void) {
  const subscriber = new IORedis(getRedisConfig());
  const channel = `${AGENT_CHANNEL_PREFIX}${runId}`;

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      onEvent(JSON.parse(message) as AgentEvent);
    } catch {
      // Ignore malformed events
    }
  });

  await subscriber.subscribe(channel);

  return {
    subscriber,
    unsubscribe: async () => {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    },
  };
}
