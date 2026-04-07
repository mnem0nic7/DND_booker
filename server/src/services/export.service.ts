import type { ExportJob as SharedExportJob, ExportReview, ExportReviewFixResult } from '@dnd-booker/shared';
import { Queue, ConnectionOptions } from 'bullmq';
import type { ExportJob as PrismaExportJob } from '@prisma/client';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { applySafeExportReviewFixes } from './export-fix.service.js';
import { resolveQueueDispatchOptions, type QueueDispatchOverrides } from './queue/config.js';

const exportQueue = new Queue('export', { connection: redis as unknown as ConnectionOptions });

export async function createExportJob(
  projectId: string,
  userId: string,
  format: 'pdf' | 'epub' | 'print_pdf',
  overrides: QueueDispatchOverrides = {},
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const job = await prisma.exportJob.create({
    data: { projectId, userId, format },
  });

  const dispatchOptions = resolveQueueDispatchOptions('export', overrides);
  await exportQueue.add('generate', { exportJobId: job.id, format }, {
    attempts: dispatchOptions.attempts,
    priority: dispatchOptions.priority,
    removeOnComplete: dispatchOptions.removeOnComplete,
    removeOnFail: dispatchOptions.removeOnFail,
    ...(dispatchOptions.backoff ? { backoff: dispatchOptions.backoff } : {}),
  });

  return serializeExportJob(job);
}

export async function getExportJob(id: string, userId: string) {
  const job = await prisma.exportJob.findFirst({ where: { id, userId } });
  return job ? serializeExportJob(job) : null;
}

export async function listExportJobs(projectId: string, userId: string, limit = 20) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const jobs = await prisma.exportJob.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return jobs.map(serializeExportJob);
}

export async function fixExportJobIssues(id: string, userId: string): Promise<ExportReviewFixResult | null> {
  const job = await prisma.exportJob.findFirst({ where: { id, userId } });
  if (!job) return null;

  const result = await applySafeExportReviewFixes(job as PrismaExportJob & { reviewJson: ExportReview | null });
  if (result.status !== 'started') {
    return {
      ...result,
      exportJob: null,
    };
  }

  const nextJob = await createExportJob(result.projectId, result.userId, result.format);
  return {
    ...result,
    exportJob: nextJob,
  };
}

function serializeExportJob(job: PrismaExportJob): SharedExportJob {
  return {
    id: job.id,
    projectId: job.projectId,
    userId: job.userId,
    format: job.format,
    status: job.status,
    progress: job.progress,
    outputUrl: job.outputUrl,
    errorMessage: job.errorMessage,
    review: job.reviewJson as ExportReview | null,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}
