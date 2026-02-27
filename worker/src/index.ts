import { Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker('export', processExportJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 2,
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));

async function shutdown() {
  console.log('Shutting down worker...');
  const SHUTDOWN_TIMEOUT_MS = 10_000;
  const forceExit = setTimeout(() => {
    console.error('Worker shutdown timed out, forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await worker.close();
    await connection.quit();
  } catch (err) {
    console.error('Error during worker shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('PDF Worker running...');
