import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job.js';
import { cleanupExportFiles } from './jobs/cleanup.job.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker('export', processExportJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 2,
});

// Cleanup worker: runs the export file cleanup job on a schedule
const cleanupWorker = new Worker('cleanup', async () => {
  await cleanupExportFiles();
}, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 1,
});

// Schedule cleanup to run every hour
const cleanupQueue = new Queue('cleanup', {
  connection: connection as unknown as ConnectionOptions,
});
cleanupQueue.upsertJobScheduler('export-cleanup', {
  every: 60 * 60 * 1000, // 1 hour
}, {
  name: 'cleanup-old-exports',
});

connection.on('error', (err) => console.error('[Redis] Connection error:', err.message));

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));
worker.on('error', (err) => console.error('[Worker] Error:', err.message));
cleanupWorker.on('error', (err) => console.error('[Cleanup Worker] Error:', err.message));

async function shutdown() {
  console.log('Shutting down worker...');
  const SHUTDOWN_TIMEOUT_MS = 70_000;
  const forceExit = setTimeout(() => {
    console.error('Worker shutdown timed out, forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await worker.close();
    await cleanupWorker.close();
    await cleanupQueue.close();
    await connection.quit();
  } catch (err) {
    console.error('Error during worker shutdown:', err);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('PDF Worker running...');
