import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job.js';
import { cleanupExportFiles } from './jobs/cleanup.job.js';
import { processGenerationJob } from './jobs/generation-orchestrator.job.js';
import { processAgentRun } from './jobs/agent-orchestrator.job.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
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

const generationWorker = new Worker('generation', processGenerationJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 1,
});

const agentWorker = new Worker('agent', processAgentRun, {
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
generationWorker.on('completed', (job) => console.log(`Generation job ${job.id} completed`));
generationWorker.on('failed', (job, err) => console.error(`Generation job ${job?.id} failed:`, err.message));
generationWorker.on('error', (err) => console.error('[Generation Worker] Error:', err.message));
agentWorker.on('completed', (job) => console.log(`Agent job ${job.id} completed`));
agentWorker.on('failed', (job, err) => console.error(`Agent job ${job?.id} failed:`, err.message));
agentWorker.on('error', (err) => console.error('[Agent Worker] Error:', err.message));

async function shutdown() {
  console.log('Shutting down worker...');
  const SHUTDOWN_TIMEOUT_MS = 70_000;
  const forceExit = setTimeout(() => {
    console.error('Worker shutdown timed out, forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await agentWorker.close();
    await generationWorker.close();
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

console.log('Workers running (export + generation + agent)...');
