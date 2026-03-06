import { describe, it, expect, afterAll } from 'vitest';
import IORedis from 'ioredis';
import {
  publishGenerationEvent,
  subscribeToRun,
  GENERATION_CHANNEL_PREFIX,
} from '../../services/generation/pubsub.service.js';

const redis = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

afterAll(async () => {
  await redis.quit();
});

describe('Generation PubSub Service', () => {
  it('should publish and receive a run_status event', async () => {
    const runId = 'test-pubsub-run-1';
    const received: unknown[] = [];

    const { unsubscribe } = await subscribeToRun(runId, (event) => {
      received.push(event);
    });

    await new Promise((r) => setTimeout(r, 100));

    await publishGenerationEvent(runId, {
      type: 'run_status',
      runId,
      status: 'planning',
      stage: 'planning',
      progressPercent: 10,
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(received.length).toBe(1);
    expect((received[0] as { type: string }).type).toBe('run_status');

    await unsubscribe();
  });

  it('should use correct channel name', () => {
    expect(GENERATION_CHANNEL_PREFIX).toBe('gen:run:');
  });
});
