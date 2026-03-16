import type {
  AgentBudget,
  AgentGoal,
  AgentRun,
  AgentRunMode,
  AgentRunStatus,
  AgentRunSummary,
  AgentScorecard,
  CritiqueBacklogItem,
  DesignProfile,
  GenerationMode,
  GenerationQuality,
} from '@dnd-booker/shared';
import { AGENT_STATUS_TRANSITIONS } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

interface CreateAgentRunInput {
  projectId: string;
  userId: string;
  mode?: AgentRunMode;
  objective?: string;
  prompt?: string;
  generationMode?: GenerationMode;
  generationQuality?: GenerationQuality;
  pageTarget?: number;
  budget?: Partial<AgentBudget>;
}

const DEFAULT_BUDGET: AgentBudget = {
  maxCycles: 4,
  maxExports: 6,
  maxImagePassesPerDocument: 2,
  maxNoImprovementStreak: 2,
  maxDurationMs: 20 * 60 * 1000,
};

function serializeRun(run: any): AgentRun {
  return {
    id: run.id,
    projectId: run.projectId,
    userId: run.userId,
    linkedGenerationRunId: run.linkedGenerationRunId ?? null,
    mode: run.mode,
    status: run.status,
    currentStage: run.currentStage ?? null,
    progressPercent: run.progressPercent ?? 0,
    goal: run.goalJson as AgentGoal,
    budget: run.budgetJson as AgentBudget,
    critiqueBacklog: (run.critiqueBacklogJson as CritiqueBacklogItem[]) ?? [],
    latestScorecard: (run.latestScorecardJson as AgentScorecard | null) ?? null,
    designProfile: (run.designProfileJson as DesignProfile | null) ?? null,
    bestCheckpointId: run.bestCheckpointId ?? null,
    latestCheckpointId: run.latestCheckpointId ?? null,
    currentStrategy: run.currentStrategy ?? null,
    cycleCount: run.cycleCount,
    exportCount: run.exportCount,
    noImprovementStreak: run.noImprovementStreak,
    failureReason: run.failureReason ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

function serializeSummary(run: any): AgentRunSummary {
  return {
    id: run.id,
    mode: run.mode,
    status: run.status,
    currentStage: run.currentStage ?? null,
    progressPercent: run.progressPercent ?? 0,
    currentStrategy: run.currentStrategy ?? null,
    cycleCount: run.cycleCount,
    exportCount: run.exportCount,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function createAgentRun(input: CreateAgentRunInput): Promise<AgentRun | null> {
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
  });
  if (!project) return null;

  const mode = input.mode ?? 'persistent_editor';
  const goal: AgentGoal = {
    objective: input.objective?.trim() || 'Improve this project into a stronger DM-ready adventure package.',
    successDefinition: 'Produce the strongest DM-ready adventure package possible within the safety budget, preferring runnable scenes, compact layout, and reversible mutations.',
    prompt: input.prompt?.trim() || null,
    targetFormat: 'pdf',
    primaryObjective: 'dm_ready_quality',
    modeIntent: mode,
    generationMode: input.generationMode ?? (project.type === 'one_shot' ? 'one_shot' : 'module'),
    generationQuality: input.generationQuality ?? 'polished',
    pageTarget: input.pageTarget ?? null,
  };

  const budget: AgentBudget = {
    ...DEFAULT_BUDGET,
    ...(input.budget ?? {}),
  };

  const run = await prisma.agentRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode,
      goalJson: goal as any,
      budgetJson: budget as any,
    },
  });

  return serializeRun(run);
}

export async function getAgentRun(runId: string, userId: string): Promise<AgentRun | null> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  return run ? serializeRun(run) : null;
}

export async function listAgentRuns(projectId: string, userId: string): Promise<AgentRunSummary[] | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return null;

  const runs = await prisma.agentRun.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
  });

  return runs.map(serializeSummary);
}

export async function transitionAgentRunStatus(
  runId: string,
  userId: string,
  newStatus: AgentRunStatus,
  failureReason?: string,
) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) return null;

  const allowed = AGENT_STATUS_TRANSITIONS[run.status as AgentRunStatus];
  if (!allowed || !allowed.includes(newStatus)) return null;

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus };

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

  if (!['completed', 'failed', 'cancelled', 'paused', 'queued'].includes(newStatus)) {
    data.currentStage = newStatus;
  }

  const updated = await prisma.agentRun.update({
    where: { id: runId },
    data,
  });

  return serializeRun(updated);
}

export async function updateAgentRunProgress(
  runId: string,
  userId: string,
  currentStage: string | null,
  progressPercent: number,
) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId }, select: { id: true } });
  if (!run) return null;

  const updated = await prisma.agentRun.update({
    where: { id: runId },
    data: {
      currentStage,
      progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    },
  });

  return serializeRun(updated);
}

export async function updateAgentRunState(input: {
  runId: string;
  currentStrategy?: string | null;
  latestScorecard?: AgentScorecard | null;
  critiqueBacklog?: CritiqueBacklogItem[];
  designProfile?: DesignProfile | null;
  bestCheckpointId?: string | null;
  latestCheckpointId?: string | null;
  linkedGenerationRunId?: string | null;
  cycleCount?: number;
  exportCount?: number;
  noImprovementStreak?: number;
}) {
  const updated = await prisma.agentRun.update({
    where: { id: input.runId },
    data: {
      ...(input.currentStrategy !== undefined ? { currentStrategy: input.currentStrategy } : {}),
      ...(input.latestScorecard !== undefined ? { latestScorecardJson: input.latestScorecard as any } : {}),
      ...(input.critiqueBacklog !== undefined ? { critiqueBacklogJson: input.critiqueBacklog as any } : {}),
      ...(input.designProfile !== undefined ? { designProfileJson: input.designProfile as any } : {}),
      ...(input.bestCheckpointId !== undefined ? { bestCheckpointId: input.bestCheckpointId } : {}),
      ...(input.latestCheckpointId !== undefined ? { latestCheckpointId: input.latestCheckpointId } : {}),
      ...(input.linkedGenerationRunId !== undefined ? { linkedGenerationRunId: input.linkedGenerationRunId } : {}),
      ...(input.cycleCount !== undefined ? { cycleCount: input.cycleCount } : {}),
      ...(input.exportCount !== undefined ? { exportCount: input.exportCount } : {}),
      ...(input.noImprovementStreak !== undefined ? { noImprovementStreak: input.noImprovementStreak } : {}),
    },
  });

  return serializeRun(updated);
}
