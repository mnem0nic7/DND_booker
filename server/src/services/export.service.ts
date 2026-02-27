import { Queue, ConnectionOptions } from 'bullmq';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';

const exportQueue = new Queue('export', { connection: redis as unknown as ConnectionOptions });

export async function createExportJob(projectId: string, userId: string, format: 'pdf' | 'epub' | 'print_pdf') {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const job = await prisma.exportJob.create({
    data: { projectId, userId, format },
  });

  await exportQueue.add('generate', { exportJobId: job.id, format }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  });

  return job;
}

export async function getExportJob(id: string, userId: string) {
  return prisma.exportJob.findFirst({ where: { id, userId } });
}

export async function listExportJobs(projectId: string, userId: string, limit = 20) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  return prisma.exportJob.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
