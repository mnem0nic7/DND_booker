import type {
  CreateImprovementLoopRequest,
  CreatorReport,
  DesignerUxNotes,
  EditorFinalReport,
  EngineeringApplyResult,
  EngineeringReport,
  ImprovementLoopInput,
  ImprovementLoopRole,
  ImprovementLoopRoleRun,
  ImprovementLoopRoleRunStatus,
  ImprovementLoopRun,
  ImprovementLoopRunMode,
  ImprovementLoopRunStatus,
  ImprovementLoopRunSummary,
  ImprovementLoopWorkspaceRunSummary,
} from '@dnd-booker/shared';
import { IMPROVEMENT_LOOP_STATUS_TRANSITIONS } from '@dnd-booker/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/database.js';

const RUN_WITH_ROLES_INCLUDE = {
  roleRuns: {
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ImprovementLoopRunInclude;

const WORKSPACE_RUN_SUMMARY_INCLUDE = {
  roleRuns: {
    orderBy: { createdAt: 'asc' },
  },
  project: {
    select: { title: true },
  },
  _count: {
    select: { artifacts: true },
  },
} satisfies Prisma.ImprovementLoopRunInclude;

const ROLE_ORDER: ImprovementLoopRole[] = ['creator', 'designer', 'editor', 'engineer'];

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

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonValue(value: unknown | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : toJsonValue(value);
}

function serializeRoleRun(roleRun: any): ImprovementLoopRoleRun {
  return {
    id: roleRun.id,
    runId: roleRun.runId,
    projectId: roleRun.projectId,
    userId: roleRun.userId,
    role: roleRun.role,
    status: roleRun.status,
    objective: roleRun.objective,
    input: (roleRun.inputJson as Record<string, unknown> | null) ?? null,
    linkedGenerationRunId: roleRun.linkedGenerationRunId ?? null,
    linkedAgentRunId: roleRun.linkedAgentRunId ?? null,
    outputArtifactIds: Array.isArray(roleRun.outputArtifactIdsJson) ? roleRun.outputArtifactIdsJson as string[] : [],
    summary: roleRun.summary ?? null,
    failureReason: roleRun.failureReason ?? null,
    createdAt: roleRun.createdAt.toISOString(),
    updatedAt: roleRun.updatedAt.toISOString(),
    startedAt: roleRun.startedAt?.toISOString() ?? null,
    completedAt: roleRun.completedAt?.toISOString() ?? null,
  };
}

function sortRoleRuns(roleRuns: any[] | undefined) {
  return [...(roleRuns ?? [])].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
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
    roles: sortRoleRuns(run.roleRuns).map(serializeRoleRun),
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
    roles: sortRoleRuns(run.roleRuns).map(serializeRoleRun),
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

function parseEditorFinalReport(run: { editorFinalReportJson?: unknown }) {
  const report = run.editorFinalReportJson;
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return null;
  }

  const candidate = report as Record<string, unknown>;
  return {
    recommendation: typeof candidate.recommendation === 'string'
      ? candidate.recommendation as ImprovementLoopWorkspaceRunSummary['editorRecommendation']
      : null,
    score: typeof candidate.overallScore === 'number' ? candidate.overallScore : null,
  };
}

function serializeWorkspaceSummary(run: any): ImprovementLoopWorkspaceRunSummary {
  const editorFinalReport = parseEditorFinalReport(run);
  return {
    runId: run.id,
    projectId: run.projectId,
    projectTitle: run.project?.title ?? 'Untitled Project',
    mode: run.mode,
    status: run.status,
    currentStage: run.currentStage ?? null,
    progressPercent: run.progressPercent ?? 0,
    roles: sortRoleRuns(run.roleRuns).map(serializeRoleRun),
    linkedGenerationRunId: run.linkedGenerationRunId ?? null,
    linkedAgentRunId: run.linkedAgentRunId ?? null,
    editorRecommendation: editorFinalReport?.recommendation ?? null,
    editorScore: editorFinalReport?.score ?? null,
    githubPullRequestNumber: run.githubPullRequestNumber ?? null,
    githubPullRequestUrl: run.githubPullRequestUrl ?? null,
    artifactCount: run._count?.artifacts ?? 0,
    failureReason: run.failureReason ?? null,
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

function buildInitialRoleSeeds(input: {
  projectId: string;
  userId: string;
  loopInput: ImprovementLoopInput;
}) {
  const { projectId, userId, loopInput } = input;
  const repoTarget = process.env.DEFAULT_ENGINEERING_REPOSITORY_FULL_NAME?.trim() || 'mnem0nic7/DND_booker';

  return [
    {
      projectId,
      userId,
      role: 'creator' as const,
      objective: loopInput.mode === 'create_campaign'
        ? 'Create the initial campaign package and hand it off to the rest of the AI team.'
        : 'Synthesize the current project into a creator-ready campaign plan without overwriting substantial authored content.',
      inputJson: {
        prompt: loopInput.prompt,
        generationMode: loopInput.generationMode,
        generationQuality: loopInput.generationQuality,
      } as Prisma.InputJsonValue,
    },
    {
      projectId,
      userId,
      role: 'designer' as const,
      objective: 'Improve the campaign package for DM utility, presentation quality, layout quality, and publication readiness.',
      inputJson: {
        objective: loopInput.objective,
        stage: 'designer',
        executionMode: 'autonomous_agent',
      } as Prisma.InputJsonValue,
    },
    {
      projectId,
      userId,
      role: 'editor' as const,
      objective: 'Independently score the final package and issue a release recommendation.',
      inputJson: {
        rubric: 'campaign_release_review',
      } as Prisma.InputJsonValue,
    },
    {
      projectId,
      userId,
      role: 'engineer' as const,
      objective: 'Translate loop findings into safe DND Booker system improvements and a draft GitHub PR when auto-apply is available.',
      inputJson: {
        targetRepository: repoTarget,
        safeAutoApply: true,
      } as Prisma.InputJsonValue,
    },
  ];
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

  const loopInput = buildInput(input.mode, input.request);
  const run = await prisma.improvementLoopRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode: input.mode,
      ...createGraphMetadata('improvement_loop'),
      inputJson: loopInput as unknown as Prisma.InputJsonValue,
      roleRuns: {
        create: buildInitialRoleSeeds({
          projectId: input.projectId,
          userId: input.userId,
          loopInput,
        }),
      },
    },
    include: RUN_WITH_ROLES_INCLUDE,
  });

  return serializeRun(run);
}

export async function getImprovementLoopRun(runId: string, userId: string): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
    include: RUN_WITH_ROLES_INCLUDE,
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
    include: RUN_WITH_ROLES_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return runs.map(serializeSummary);
}

export async function listRecentImprovementLoopRuns(userId: string, limit = 24): Promise<ImprovementLoopWorkspaceRunSummary[]> {
  const runs = await prisma.improvementLoopRun.findMany({
    where: { userId },
    include: WORKSPACE_RUN_SUMMARY_INCLUDE,
    orderBy: [
      { updatedAt: 'desc' },
      { createdAt: 'desc' },
    ],
    take: Math.max(1, Math.min(limit, 100)),
  });

  return runs.map(serializeWorkspaceSummary);
}

export async function transitionImprovementLoopStatus(
  runId: string,
  userId: string,
  newStatus: ImprovementLoopRunStatus,
  failureReason?: string,
): Promise<ImprovementLoopRun | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
    include: RUN_WITH_ROLES_INCLUDE,
  });
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
    include: RUN_WITH_ROLES_INCLUDE,
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
    include: RUN_WITH_ROLES_INCLUDE,
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
    include: RUN_WITH_ROLES_INCLUDE,
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

  const data: Prisma.ImprovementLoopRunUncheckedUpdateInput = {
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
  };
  if (input.linkedGenerationRunId !== undefined) data.linkedGenerationRunId = input.linkedGenerationRunId;
  if (input.linkedAgentRunId !== undefined) data.linkedAgentRunId = input.linkedAgentRunId;
  if (input.creatorReport !== undefined) data.creatorReportJson = toNullableJsonValue(input.creatorReport);
  if (input.designerUxNotes !== undefined) data.designerUxNotesJson = toNullableJsonValue(input.designerUxNotes);
  if (input.editorFinalReport !== undefined) data.editorFinalReportJson = toNullableJsonValue(input.editorFinalReport);
  if (input.engineeringReport !== undefined) data.engineeringReportJson = toNullableJsonValue(input.engineeringReport);
  if (input.engineeringApplyResult !== undefined) data.engineeringApplyResultJson = toNullableJsonValue(input.engineeringApplyResult);
  if (input.githubBranchName !== undefined) data.githubBranchName = input.githubBranchName;
  if (input.githubBaseBranch !== undefined) data.githubBaseBranch = input.githubBaseBranch;
  if (input.githubHeadSha !== undefined) data.githubHeadSha = input.githubHeadSha;
  if (input.githubPullRequestNumber !== undefined) data.githubPullRequestNumber = input.githubPullRequestNumber;
  if (input.githubPullRequestUrl !== undefined) data.githubPullRequestUrl = input.githubPullRequestUrl;

  const updated = await prisma.improvementLoopRun.update({
    where: { id: input.runId },
    data,
    include: RUN_WITH_ROLES_INCLUDE,
  });

  return serializeRun(updated);
}

export async function ensureImprovementLoopRoleRun(input: {
  runId: string;
  projectId: string;
  userId: string;
  role: ImprovementLoopRole;
  objective: string;
  stageInput?: Record<string, unknown> | null;
}): Promise<ImprovementLoopRoleRun> {
  const roleRun = await prisma.improvementLoopRoleRun.upsert({
    where: {
      runId_role: {
        runId: input.runId,
        role: input.role,
      },
    },
    create: {
      runId: input.runId,
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      objective: input.objective,
      ...(input.stageInput !== undefined ? { inputJson: toNullableJsonValue(input.stageInput) } : {}),
    },
    update: (() => {
      const data: Prisma.ImprovementLoopRoleRunUncheckedUpdateInput = {
        objective: input.objective,
      };
      if (input.stageInput !== undefined) {
        data.inputJson = toNullableJsonValue(input.stageInput);
      }
      return data;
    })(),
  });

  return serializeRoleRun(roleRun);
}

export async function updateImprovementLoopRoleRun(input: {
  runId: string;
  role: ImprovementLoopRole;
  status?: ImprovementLoopRoleRunStatus;
  objective?: string;
  stageInput?: Record<string, unknown> | null;
  linkedGenerationRunId?: string | null;
  linkedAgentRunId?: string | null;
  outputArtifactId?: string;
  summary?: string | null;
  failureReason?: string | null;
}): Promise<ImprovementLoopRoleRun | null> {
  const current = await prisma.improvementLoopRoleRun.findUnique({
    where: {
      runId_role: {
        runId: input.runId,
        role: input.role,
      },
    },
  });
  if (!current) return null;

  const now = new Date();
  const outputArtifactIds = Array.isArray(current.outputArtifactIdsJson)
    ? [...current.outputArtifactIdsJson as string[]]
    : [];
  if (input.outputArtifactId && !outputArtifactIds.includes(input.outputArtifactId)) {
    outputArtifactIds.push(input.outputArtifactId);
  }

  const nextStatus = input.status ?? current.status;
  const isTerminalStatus = nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'skipped';
  const data: Prisma.ImprovementLoopRoleRunUncheckedUpdateInput = {};

  if (input.status !== undefined) data.status = input.status;
  if (input.objective !== undefined) data.objective = input.objective;
  if (input.stageInput !== undefined) data.inputJson = toNullableJsonValue(input.stageInput);
  if (input.linkedGenerationRunId !== undefined) data.linkedGenerationRunId = input.linkedGenerationRunId;
  if (input.linkedAgentRunId !== undefined) data.linkedAgentRunId = input.linkedAgentRunId;
  if (input.outputArtifactId) data.outputArtifactIdsJson = outputArtifactIds as Prisma.InputJsonValue;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.failureReason !== undefined) data.failureReason = input.failureReason;
  if (nextStatus === 'running' && !current.startedAt) data.startedAt = now;
  if (isTerminalStatus) data.completedAt = current.completedAt ?? now;
  if (input.status === 'running') {
    data.completedAt = null;
    data.failureReason = null;
  }
  if (input.status === 'completed' || input.status === 'skipped') {
    data.failureReason = input.failureReason ?? null;
  }

  const updated = await prisma.improvementLoopRoleRun.update({
    where: { id: current.id },
    data,
  });

  return serializeRoleRun(updated);
}
