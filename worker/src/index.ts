import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { processExportJob } from './jobs/export.job.js';

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null,
});

const worker = new Worker('export', processExportJob, {
  connection: connection as any,
  concurrency: 2,
});

worker.on('completed', (job) => console.log(`Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`Job ${job?.id} failed:`, err.message));

console.log('PDF Worker running...');
