import { prisma } from '../../config/database.js';
import type {
  RunStatus,
  GenerationMode,
  GenerationQuality,
  GenerationConstraints,
  GenerationRun,
  InterviewBrief,
  QualityBudgetLane,
  GenerationRunInputParameters,
} from '@dnd-booker/shared';
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

function qualityToBudgetLane(quality: GenerationQuality | undefined): QualityBudgetLane {
  if (quality === 'polished') {
    return 'high_quality';
  }

  return 'fast';
}

function serializeRun(run: any): GenerationRun {
  const graphStateJson = (run.graphStateJson as Record<string, unknown> | null) ?? null;
  const routedRewriteCounts = graphStateJson && typeof graphStateJson['routedRewriteCounts'] === 'object' && graphStateJson['routedRewriteCounts']
    ? graphStateJson['routedRewriteCounts'] as GenerationRun['routedRewriteCounts']
    : null;

  return {
    id: run.id,
    projectId: run.projectId,
    userId: run.userId,
    mode: run.mode,
    quality: run.quality,
    status: run.status,
    currentStage: run.currentStage ?? null,
    inputPrompt: run.inputPrompt,
    inputParameters: (run.inputParameters as GenerationRunInputParameters | null) ?? null,
    progressPercent: run.progressPercent ?? 0,
    estimatedPages: run.estimatedPages ?? null,
    estimatedTokens: run.estimatedTokens ?? null,
    estimatedCost: run.estimatedCost ?? null,
    actualTokens: run.actualTokens ?? 0,
    actualCost: run.actualCost ?? 0,
    failureReason: run.failureReason ?? null,
    agentStage: typeof graphStateJson?.['agentStage'] === 'string' ? graphStateJson['agentStage'] as GenerationRun['agentStage'] : null,
    criticCycle: typeof graphStateJson?.['criticCycle'] === 'number' ? graphStateJson['criticCycle'] as number : null,
    qualityBudgetLane: typeof graphStateJson?.['qualityBudgetLane'] === 'string' ? graphStateJson['qualityBudgetLane'] as QualityBudgetLane : null,
    routedRewriteCounts,
    imageGenerationStatus: typeof graphStateJson?.['imageGenerationStatus'] === 'string'
      ? graphStateJson['imageGenerationStatus'] as GenerationRun['imageGenerationStatus']
      : null,
    finalEditorialStatus: typeof graphStateJson?.['finalEditorialStatus'] === 'string'
      ? graphStateJson['finalEditorialStatus'] as GenerationRun['finalEditorialStatus']
      : null,
    graphThreadId: run.graphThreadId ?? null,
    graphCheckpointKey: run.graphCheckpointKey ?? null,
    graphStateJson,
    resumeToken: run.resumeToken ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

interface CreateRunInput {
  projectId: string;
  userId: string;
  prompt?: string;
  interviewSessionId?: string;
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

  const lockedInterview = input.interviewSessionId
    ? await prisma.interviewSession.findFirst({
      where: {
        id: input.interviewSessionId,
        projectId: input.projectId,
        userId: input.userId,
        status: 'locked',
      },
      select: {
        id: true,
        lockedBrief: true,
      },
    })
    : null;

  if (input.interviewSessionId && !lockedInterview) {
    return null;
  }

  const interviewBrief = (lockedInterview?.lockedBrief ?? null) as InterviewBrief | null;
  const qualityBudgetLane = interviewBrief?.qualityBudgetLane ?? qualityToBudgetLane(input.quality);
  const inputPrompt = interviewBrief?.summary ?? input.prompt ?? '';
  const inputParameters = interviewBrief
    ? {
      interviewSessionId: lockedInterview!.id,
      qualityBudgetLane: interviewBrief.qualityBudgetLane,
      interviewBrief,
      autonomousFlowVersion: 'agentic_v1',
    }
    : (input.constraints as GenerationRunInputParameters | undefined);
  const graphMetadata = createGraphMetadata('generation');

  const run = await prisma.$transaction(async (tx) => {
    const createdRun = await tx.generationRun.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        mode: interviewBrief?.generationMode ?? input.mode ?? 'one_shot',
        quality: input.quality ?? 'quick',
        ...graphMetadata,
        inputPrompt,
        inputParameters: (inputParameters as any) ?? undefined,
        estimatedPages: input.pageTarget ?? null,
        graphStateJson: mergeGraphState(graphMetadata.graphStateJson, {
          agentStage: interviewBrief ? 'interview_locked' : null,
          criticCycle: 0,
          qualityBudgetLane,
          routedRewriteCounts: {
            writer: 0,
            dndExpert: 0,
            layoutExpert: 0,
            artist: 0,
          },
          imageGenerationStatus: 'not_requested',
          finalEditorialStatus: 'pending',
        }),
      },
    });

    if (interviewBrief) {
      await tx.generatedArtifact.create({
        data: {
          runId: createdRun.id,
          projectId: input.projectId,
          artifactType: 'interview_brief',
          artifactKey: 'interview-brief',
          status: 'accepted',
          version: 1,
          title: interviewBrief.title,
          summary: interviewBrief.summary,
          jsonContent: interviewBrief as any,
        },
      });
    }

    return createdRun;
  });

  return serializeRun(run);
}

export async function getRun(runId: string, userId: string) {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, userId },
  });
  return run ? serializeRun(run) : null;
}

export async function listRuns(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) return null;

  const runs = await prisma.generationRun.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
  });

  return runs.map(serializeRun);
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

  const updated = await prisma.generationRun.update({
    where: { id: runId },
    data,
  });

  return serializeRun(updated);
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
