import { prisma } from '../../config/database.js';
import type { RunStatus, GenerationMode, GenerationQuality, GenerationConstraints } from '@dnd-booker/shared';
import { RUN_STATUS_TRANSITIONS } from '@dnd-booker/shared';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

function createGraphMetadata(kind: 'generation') {
  const graphThreadId = `${kind}:${randomUUID()}`;
  const graphCheckpointKey = `${kind}:${randomUUID()}`;
  const resumeToken = `${graphCheckpointKey}:queued`;

  return {
    graphThreadId,
    graphCheckpointKey,
    resumeToken,
    graphStateJson: {
      kind,
      graphThreadId,
      graphCheckpointKey,
      resumeToken,
      status: 'queued',
      currentStage: 'queued',
      progressPercent: 0,
      updatedAt: new Date().toISOString(),
    } as Prisma.InputJsonValue,
  };
}

function mergeGraphState(existing: unknown, patch: Record<string, unknown>): Prisma.InputJsonValue {
  const current = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? existing as Record<string, unknown>
    : {};
  return {
    ...current,
    ...patch,
  } as Prisma.InputJsonValue;
}

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
      ...createGraphMetadata('generation'),
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
  const nextStage = !['completed', 'failed', 'cancelled', 'paused', 'queued'].includes(newStatus)
    ? newStatus
    : (newStatus === 'queued' ? 'queued' : null);

  if (run.status === 'queued' && !run.startedAt) {
    data.startedAt = now;
  }

  if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
    data.completedAt = now;
    data.currentStage = null;
  }

  if (newStatus === 'failed' && failureReason) {
    data.failureReason = failureReason;
  }

  if (newStatus === 'completed') {
    data.progressPercent = 100;
  }

  if (nextStage !== null) {
    data.currentStage = nextStage;
  }

  const currentProgress = typeof data.progressPercent === 'number'
    ? data.progressPercent
    : run.progressPercent;
  const resumeToken = `${run.id}:${newStatus}:${currentProgress}`;
  data.resumeToken = resumeToken;
  data.graphStateJson = mergeGraphState(run.graphStateJson, {
    status: newStatus,
    currentStage: nextStage,
    progressPercent: currentProgress,
    failureReason: newStatus === 'failed' ? (failureReason ?? run.failureReason ?? null) : run.failureReason ?? null,
    startedAt: data.startedAt instanceof Date ? data.startedAt.toISOString() : run.startedAt?.toISOString() ?? null,
    completedAt: data.completedAt instanceof Date ? data.completedAt.toISOString() : run.completedAt?.toISOString() ?? null,
    resumeToken,
    updatedAt: now.toISOString(),
  });

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
    select: { id: true, graphStateJson: true },
  });
  if (!run) return null;

  const nextProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  return prisma.generationRun.update({
    where: { id: runId },
    data: {
      currentStage,
      progressPercent: nextProgress,
      resumeToken: `${runId}:${currentStage ?? 'unknown'}:${nextProgress}`,
      graphStateJson: mergeGraphState(run.graphStateJson, {
        currentStage,
        progressPercent: nextProgress,
        resumeToken: `${runId}:${currentStage ?? 'unknown'}:${nextProgress}`,
        updatedAt: new Date().toISOString(),
      }),
    },
  });
}

export async function updateRunGraphState(
  runId: string,
  userId: string,
  patch: Record<string, unknown>,
) {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, userId },
    select: { graphStateJson: true },
  });
  if (!run) return null;

  return prisma.generationRun.update({
    where: { id: runId },
    data: {
      graphStateJson: mergeGraphState(run.graphStateJson, {
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
      ...(typeof patch['resumeToken'] === 'string' ? { resumeToken: patch['resumeToken'] } : {}),
      ...(typeof patch['graphThreadId'] === 'string' ? { graphThreadId: patch['graphThreadId'] } : {}),
      ...(typeof patch['graphCheckpointKey'] === 'string' ? { graphCheckpointKey: patch['graphCheckpointKey'] } : {}),
    },
  });
}
