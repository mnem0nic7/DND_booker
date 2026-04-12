import IORedis from 'ioredis';
import type { ImprovementLoopEvent } from '@dnd-booker/shared';

export const IMPROVEMENT_LOOP_CHANNEL_PREFIX = 'improvement-loop:run:';

function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export async function publishImprovementLoopEvent(runId: string, event: ImprovementLoopEvent) {
  const { redis } = await import('../../config/redis.js');
  await redis.publish(`${IMPROVEMENT_LOOP_CHANNEL_PREFIX}${runId}`, JSON.stringify(event));
}

export async function subscribeToImprovementLoopRun(runId: string, onEvent: (event: ImprovementLoopEvent) => void) {
  const subscriber = new IORedis(getRedisConfig());
  const channel = `${IMPROVEMENT_LOOP_CHANNEL_PREFIX}${runId}`;

  subscriber.on('message', (_channel: string, message: string) => {
    try {
      onEvent(JSON.parse(message) as ImprovementLoopEvent);
    } catch {
      // Ignore malformed messages.
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
