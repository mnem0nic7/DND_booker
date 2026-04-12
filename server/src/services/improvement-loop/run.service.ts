import type {
  CreateImprovementLoopRequest,
  CreatorReport,
  DesignerUxNotes,
  EditorFinalReport,
  EngineeringApplyResult,
  EngineeringReport,
  ImprovementLoopInput,
  ImprovementLoopRun,
  ImprovementLoopRunMode,
  ImprovementLoopRunStatus,
  ImprovementLoopRunSummary,
} from '@dnd-booker/shared';
import { IMPROVEMENT_LOOP_STATUS_TRANSITIONS } from '@dnd-booker/shared';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';

function createGraphMetadata(kind: 'improvement_loop') {
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

function serializeRun(run: any): ImprovementLoopRun {
  return {
    id: run.id,
    projectId: run.projectId,
    userId: run.userId,
    mode: run.mode,
    status: run.status,
    currentStage: run.currentStage ?? null,
    progressPercent: run.progressPercent ?? 0,
    input: run.inputJson as ImprovementLoopInput,
    linkedGenerationRunId: run.linkedGenerationRunId ?? null,
    linkedAgentRunId: run.linkedAgentRunId ?? null,
    creatorReport: (run.creatorReportJson as CreatorReport | null) ?? null,
    designerUxNotes: (run.designerUxNotesJson as DesignerUxNotes | null) ?? null,
    editorFinalReport: (run.editorFinalReportJson as EditorFinalReport | null) ?? null,
    engineeringReport: (run.engineeringReportJson as EngineeringReport | null) ?? null,
    engineeringApplyResult: (run.engineeringApplyResultJson as EngineeringApplyResult | null) ?? null,
    githubBranchName: run.githubBranchName ?? null,
    githubBaseBranch: run.githubBaseBranch ?? null,
    githubHeadSha: run.githubHeadSha ?? null,
    githubPullRequestNumber: run.githubPullRequestNumber ?? null,
    githubPullRequestUrl: run.githubPullRequestUrl ?? null,
    failureReason: run.failureReason ?? null,
    graphThreadId: run.graphThreadId ?? null,
    graphCheckpointKey: run.graphCheckpointKey ?? null,
    graphStateJson: (run.graphStateJson as Record<string, unknown> | null) ?? null,
    resumeToken: run.resumeToken ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function serializeSummary(run: any): ImprovementLoopRunSummary {
  return {
    id: run.id,
    projectId: run.projectId,
    mode: run.mode,
    status: run.status,
    currentStage: run.currentStage ?? null,
    progressPercent: run.progressPercent ?? 0,
    linkedGenerationRunId: run.linkedGenerationRunId ?? null,
    linkedAgentRunId: run.linkedAgentRunId ?? null,
    githubPullRequestNumber: run.githubPullRequestNumber ?? null,
    githubPullRequestUrl: run.githubPullRequestUrl ?? null,
    failureReason: run.failureReason ?? null,
    graphThreadId: run.graphThreadId ?? null,
    graphCheckpointKey: run.graphCheckpointKey ?? null,
    graphStateJson: (run.graphStateJson as Record<string, unknown> | null) ?? null,
    resumeToken: run.resumeToken ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function buildInput(mode: ImprovementLoopRunMode, request: CreateImprovementLoopRequest & { projectTitle?: string | null }): ImprovementLoopInput {
  return {
    mode,
    prompt: request.prompt?.trim() || null,
    objective: request.objective?.trim()
      || 'Create, improve, review, and engineer a stronger campaign package.',
    projectTitle: request.projectTitle?.trim() || null,
    generationMode: request.generationMode ?? 'campaign',
    generationQuality: request.generationQuality ?? 'polished',
    agentMode: 'persistent_editor',
  };
}

export async function createImprovementLoopRun(input: {
  projectId: string;
  userId: string;
  mode: ImprovementLoopRunMode;
  request: CreateImprovementLoopRequest & { projectTitle?: string | null };
}): Promise<ImprovementLoopRun | null> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true },
  });
  if (!project) return null;

  const run = await prisma.improvementLoopRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode: input.mode,
      ...createGraphMetadata('improvement_loop'),
      inputJson: buildInput(input.mode, input.request) as any,
    },
  });

  return serializeRun(run);
}

export async function getImprovementLoopRun(runId: string, userId: string): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
  });
  return run ? serializeRun(run) : null;
}

export async function listImprovementLoopRuns(projectId: string, userId: string): Promise<ImprovementLoopRunSummary[] | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;

  const runs = await prisma.improvementLoopRun.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
  });
  return runs.map(serializeSummary);
}

export async function transitionImprovementLoopStatus(
  runId: string,
  userId: string,
  newStatus: ImprovementLoopRunStatus,
  failureReason?: string,
): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({ where: { id: runId, userId } });
  if (!run) return null;

  const allowed = IMPROVEMENT_LOOP_STATUS_TRANSITIONS[run.status as ImprovementLoopRunStatus];
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

  const updated = await prisma.improvementLoopRun.update({
    where: { id: runId },
    data,
  });

  return serializeRun(updated);
}

export async function updateImprovementLoopProgress(
  runId: string,
  userId: string,
  currentStage: string | null,
  progressPercent: number,
): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, graphStateJson: true },
  });
  if (!run) return null;

  const nextProgress = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const updated = await prisma.improvementLoopRun.update({
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

  return serializeRun(updated);
}

export async function updateImprovementLoopGraphState(input: {
  runId: string;
  userId: string;
  patch: Record<string, unknown>;
}): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: input.runId, userId: input.userId },
    select: { graphStateJson: true },
  });
  if (!run) return null;

  const updated = await prisma.improvementLoopRun.update({
    where: { id: input.runId },
    data: {
      graphStateJson: mergeGraphState(run.graphStateJson, {
        ...input.patch,
        updatedAt: new Date().toISOString(),
      }),
      ...(typeof input.patch['resumeToken'] === 'string' ? { resumeToken: input.patch['resumeToken'] } : {}),
      ...(typeof input.patch['graphThreadId'] === 'string' ? { graphThreadId: input.patch['graphThreadId'] } : {}),
      ...(typeof input.patch['graphCheckpointKey'] === 'string' ? { graphCheckpointKey: input.patch['graphCheckpointKey'] } : {}),
    },
  });

  return serializeRun(updated);
}

export async function updateImprovementLoopState(input: {
  runId: string;
  linkedGenerationRunId?: string | null;
  linkedAgentRunId?: string | null;
  creatorReport?: CreatorReport | null;
  designerUxNotes?: DesignerUxNotes | null;
  editorFinalReport?: EditorFinalReport | null;
  engineeringReport?: EngineeringReport | null;
  engineeringApplyResult?: EngineeringApplyResult | null;
  githubBranchName?: string | null;
  githubBaseBranch?: string | null;
  githubHeadSha?: string | null;
  githubPullRequestNumber?: number | null;
  githubPullRequestUrl?: string | null;
}) {
  const current = await prisma.improvementLoopRun.findUnique({
    where: { id: input.runId },
    select: { graphStateJson: true },
  });
  if (!current) return null;

  const updated = await prisma.improvementLoopRun.update({
    where: { id: input.runId },
    data: {
      ...(input.linkedGenerationRunId !== undefined ? { linkedGenerationRunId: input.linkedGenerationRunId } : {}),
      ...(input.linkedAgentRunId !== undefined ? { linkedAgentRunId: input.linkedAgentRunId } : {}),
      ...(input.creatorReport !== undefined ? { creatorReportJson: input.creatorReport as any } : {}),
      ...(input.designerUxNotes !== undefined ? { designerUxNotesJson: input.designerUxNotes as any } : {}),
      ...(input.editorFinalReport !== undefined ? { editorFinalReportJson: input.editorFinalReport as any } : {}),
      ...(input.engineeringReport !== undefined ? { engineeringReportJson: input.engineeringReport as any } : {}),
      ...(input.engineeringApplyResult !== undefined ? { engineeringApplyResultJson: input.engineeringApplyResult as any } : {}),
      ...(input.githubBranchName !== undefined ? { githubBranchName: input.githubBranchName } : {}),
      ...(input.githubBaseBranch !== undefined ? { githubBaseBranch: input.githubBaseBranch } : {}),
      ...(input.githubHeadSha !== undefined ? { githubHeadSha: input.githubHeadSha } : {}),
      ...(input.githubPullRequestNumber !== undefined ? { githubPullRequestNumber: input.githubPullRequestNumber } : {}),
      ...(input.githubPullRequestUrl !== undefined ? { githubPullRequestUrl: input.githubPullRequestUrl } : {}),
      graphStateJson: mergeGraphState(current.graphStateJson, {
        ...(input.linkedGenerationRunId !== undefined ? { linkedGenerationRunId: input.linkedGenerationRunId } : {}),
        ...(input.linkedAgentRunId !== undefined ? { linkedAgentRunId: input.linkedAgentRunId } : {}),
        ...(input.creatorReport !== undefined ? { creatorReport: input.creatorReport } : {}),
        ...(input.designerUxNotes !== undefined ? { designerUxNotes: input.designerUxNotes } : {}),
        ...(input.editorFinalReport !== undefined ? { editorFinalReport: input.editorFinalReport } : {}),
        ...(input.engineeringReport !== undefined ? { engineeringReport: input.engineeringReport } : {}),
        ...(input.engineeringApplyResult !== undefined ? { engineeringApplyResult: input.engineeringApplyResult } : {}),
        ...(input.githubBranchName !== undefined ? { githubBranchName: input.githubBranchName } : {}),
        ...(input.githubBaseBranch !== undefined ? { githubBaseBranch: input.githubBaseBranch } : {}),
        ...(input.githubHeadSha !== undefined ? { githubHeadSha: input.githubHeadSha } : {}),
        ...(input.githubPullRequestNumber !== undefined ? { githubPullRequestNumber: input.githubPullRequestNumber } : {}),
        ...(input.githubPullRequestUrl !== undefined ? { githubPullRequestUrl: input.githubPullRequestUrl } : {}),
        updatedAt: new Date().toISOString(),
      }),
    },
  });

  return serializeRun(updated);
}
