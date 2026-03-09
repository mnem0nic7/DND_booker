import { prisma } from '../../config/database.js';
import type { RunStatus, GenerationMode, GenerationQuality, GenerationConstraints } from '@dnd-booker/shared';
import { RUN_STATUS_TRANSITIONS } from '@dnd-booker/shared';

interface CreateRunInput {
  projectId: string;
  userId: string;
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

export async function createRun(input: CreateRunInput) {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
  });
  if (!project) return null;

  return prisma.generationRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode: input.mode ?? 'one_shot',
      quality: input.quality ?? 'quick',
      inputPrompt: input.prompt,
      inputParameters: (input.constraints as any) ?? undefined,
      estimatedPages: input.pageTarget ?? null,
    },
  });
}

export async function getRun(runId: string, userId: string) {
  return prisma.generationRun.findFirst({
    where: { id: runId, userId },
  });
}

export async function listRuns(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) return null;

  return prisma.generationRun.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function transitionRunStatus(
  runId: string,
  userId: string,
  newStatus: RunStatus,
  failureReason?: string,
) {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return null;

  const allowed = RUN_STATUS_TRANSITIONS[run.status as RunStatus];
  if (!allowed || !allowed.includes(newStatus)) return null;

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus };

  if (run.status === 'queued' && !run.startedAt) {
    data.startedAt = now;
  }

  if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
    data.completedAt = now;
  }

  if (newStatus === 'failed' && failureReason) {
    data.failureReason = failureReason;
  }

  if (!['completed', 'failed', 'cancelled', 'paused', 'queued'].includes(newStatus)) {
    data.currentStage = newStatus;
  }

  return prisma.generationRun.update({
    where: { id: runId },
    data,
  });
}

export async function updateRunProgress(
  runId: string,
  userId: string,
  currentStage: string | null,
  progressPercent: number,
) {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) return null;

  return prisma.generationRun.update({
    where: { id: runId },
    data: {
      currentStage,
      progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    },
  });
}
