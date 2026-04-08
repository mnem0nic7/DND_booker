import { createServer } from 'node:http';
import { Worker, Queue, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job.js';
import { cleanupExportFiles } from './jobs/cleanup.job.js';
import { processGenerationJob } from './jobs/generation-orchestrator.job.js';
import { processAgentRun } from './jobs/agent-orchestrator.job.js';
import { resolveWorkerConcurrency, resolveWorkerTiming } from './runtime-config.js';
import { startRuntimeAuditLoop } from './runtime-audit.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

let workerReady = false;
console.info('[worker.lifecycle] startup');
const healthPort = Number(process.env.PORT);
const healthServer = Number.isFinite(healthPort) && healthPort > 0
  ? createServer((_req, res) => {
    const statusCode = workerReady ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: workerReady ? 'ok' : 'starting', service: 'worker' }));
  })
  : null;

const { longRunningJobLockMs: LONG_RUNNING_JOB_LOCK_MS, stalledCheckIntervalMs: STALLED_CHECK_INTERVAL_MS } = resolveWorkerTiming();
const DEFAULT_WORKER_CONCURRENCY = Number.parseInt(process.env.WORKER_CONCURRENCY ?? '', 10);
const BASE_WORKER_CONCURRENCY = Number.isFinite(DEFAULT_WORKER_CONCURRENCY) && DEFAULT_WORKER_CONCURRENCY > 0
  ? DEFAULT_WORKER_CONCURRENCY
  : 1;
const EXPORT_WORKER_CONCURRENCY = resolveWorkerConcurrency('export', BASE_WORKER_CONCURRENCY + 1);
const CLEANUP_WORKER_CONCURRENCY = resolveWorkerConcurrency('cleanup', BASE_WORKER_CONCURRENCY);
const GENERATION_WORKER_CONCURRENCY = resolveWorkerConcurrency('generation', BASE_WORKER_CONCURRENCY);
const AGENT_WORKER_CONCURRENCY = resolveWorkerConcurrency('agent', BASE_WORKER_CONCURRENCY);

const worker = new Worker('export', processExportJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: EXPORT_WORKER_CONCURRENCY,
});

// Cleanup worker: runs the export file cleanup job on a schedule
const cleanupWorker = new Worker('cleanup', async () => {
  await cleanupExportFiles();
}, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: CLEANUP_WORKER_CONCURRENCY,
});

const generationWorker = new Worker('generation', processGenerationJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: GENERATION_WORKER_CONCURRENCY,
  lockDuration: LONG_RUNNING_JOB_LOCK_MS,
  stalledInterval: STALLED_CHECK_INTERVAL_MS,
  maxStalledCount: 2,
});

const agentWorker = new Worker('agent', processAgentRun, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: AGENT_WORKER_CONCURRENCY,
  lockDuration: LONG_RUNNING_JOB_LOCK_MS,
  stalledInterval: STALLED_CHECK_INTERVAL_MS,
  maxStalledCount: 2,
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
connection.on('ready', () => {
  workerReady = true;
  console.info('[worker.lifecycle] ready');
});
connection.on('close', () => {
  workerReady = false;
  console.warn('[worker.lifecycle] redis connection closed');
});
connection.on('end', () => {
  workerReady = false;
  console.warn('[worker.lifecycle] redis connection ended');
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[worker.export] job ${job?.id} failed:`, err.message));
worker.on('error', (err) => console.error('[Worker] Error:', err.message));
cleanupWorker.on('error', (err) => console.error('[Cleanup Worker] Error:', err.message));
generationWorker.on('completed', (job) => console.log(`Generation job ${job.id} completed`));
generationWorker.on('failed', (job, err) => console.error(`[worker.generation] job ${job?.id} failed:`, err.message));
generationWorker.on('error', (err) => console.error('[Generation Worker] Error:', err.message));
agentWorker.on('completed', (job) => console.log(`Agent job ${job.id} completed`));
agentWorker.on('failed', (job, err) => console.error(`[worker.agent] job ${job?.id} failed:`, err.message));
agentWorker.on('error', (err) => console.error('[Agent Worker] Error:', err.message));

const stopRuntimeAudit = startRuntimeAuditLoop();

async function shutdown() {
  console.info('[worker.lifecycle] shutting down');
  const SHUTDOWN_TIMEOUT_MS = 70_000;
  const forceExit = setTimeout(() => {
    console.error('Worker shutdown timed out, forcing exit.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    stopRuntimeAudit();
    await new Promise<void>((resolve, reject) => {
      if (!healthServer) {
        resolve();
        return;
      }
      healthServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
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

if (healthServer) {
  healthServer.listen(healthPort, '0.0.0.0', () => {
    console.log(`Worker health server listening on port ${healthPort}`);
  });
}

console.log('Workers running (export + generation + agent)...');
