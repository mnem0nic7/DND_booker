import IORedis from 'ioredis';
import type { GenerationEvent } from '@dnd-booker/shared';

export const GENERATION_CHANNEL_PREFIX = 'gen:run:';

function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

export async function publishGenerationEvent(runId: string, event: GenerationEvent) {
  const { redis } = await import('../../config/redis.js');
  const channel = `${GENERATION_CHANNEL_PREFIX}${runId}`;
  await redis.publish(channel, JSON.stringify(event));
}

export async function subscribeToRun(
  runId: string,
  onEvent: (event: GenerationEvent) => void,
) {
  const subscriber = new IORedis(getRedisConfig());
  const channel = `${GENERATION_CHANNEL_PREFIX}${runId}`;

  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message) as GenerationEvent;
      onEvent(event);
    } catch {
      // Ignore malformed messages
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
