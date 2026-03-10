import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import {
  subscribeToRun,
  GENERATION_CHANNEL_PREFIX,
} from '../../services/generation/pubsub.service.js';

describe('Generation PubSub Service', () => {
  it('should publish and receive a run_status event', async () => {
    const runId = 'test-pubsub-run-1';
    const received: unknown[] = [];

    const { unsubscribe } = await subscribeToRun(runId, (event) => {
      received.push(event);
    });

    // Allow subscriber to fully connect
    await new Promise((r) => setTimeout(r, 200));

    // Publish directly to avoid shared-singleton timing issues with config/redis.ts
    const pub = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6380,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
    const channel = `${GENERATION_CHANNEL_PREFIX}${runId}`;
    await pub.publish(channel, JSON.stringify({
      type: 'run_status',
      runId,
      status: 'planning',
      stage: 'planning',
      progressPercent: 10,
    }));
    await pub.quit();

    await new Promise((r) => setTimeout(r, 500));

    expect(received.length).toBe(1);
    expect((received[0] as { type: string }).type).toBe('run_status');

    await unsubscribe();
  }, 10_000);

  it('should use correct channel name', () => {
    expect(GENERATION_CHANNEL_PREFIX).toBe('gen:run:');
  });
});
