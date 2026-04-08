import type {
  GraphInterrupt,
  GraphInterruptResolutionAction,
  GraphInterruptStatus,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

type GraphRunType = 'generation' | 'agent';

interface GraphRunRecord {
  id: string;
  projectId: string;
  userId: string;
  graphStateJson: unknown;
}

interface ResolveInterruptResult {
  status: 'resolved' | 'run_not_found' | 'interrupt_not_found' | 'interrupt_not_pending';
  interrupt?: GraphInterrupt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeInterruptStatus(value: unknown): GraphInterruptStatus {
  return value === 'approved' || value === 'edited' || value === 'rejected'
    ? value
    : 'pending';
}

function normalizeGraphInterrupt(
  raw: unknown,
  runType: GraphRunType,
  runId: string,
): GraphInterrupt | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') {
    return null;
  }

  const kind = typeof raw.kind === 'string' && raw.kind.trim()
    ? raw.kind.trim()
    : 'manual_review';
  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.trim()
    : kind.replace(/_/g, ' ');
  const summary = typeof raw.summary === 'string' && raw.summary.trim()
    ? raw.summary.trim()
    : null;
  const resolvedAt = typeof raw.resolvedAt === 'string' ? raw.resolvedAt : null;
  const resolvedByUserId = typeof raw.resolvedByUserId === 'string' ? raw.resolvedByUserId : null;
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();

  return {
    id: raw.id,
    runType,
    runId,
    kind,
    title,
    summary,
    status: normalizeInterruptStatus(raw.status),
    payload: raw.payload ?? null,
    resolutionPayload: raw.resolutionPayload ?? null,
    resolvedByUserId,
    createdAt,
    resolvedAt,
  };
}

function readInterrupts(graphStateJson: unknown, runType: GraphRunType, runId: string): GraphInterrupt[] {
  if (!isRecord(graphStateJson) || !Array.isArray(graphStateJson.interrupts)) {
    return [];
  }

  return graphStateJson.interrupts
    .map((interrupt) => normalizeGraphInterrupt(interrupt, runType, runId))
    .filter((interrupt): interrupt is GraphInterrupt => Boolean(interrupt))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function writeInterrupts(graphStateJson: unknown, interrupts: GraphInterrupt[]) {
  const current = isRecord(graphStateJson) ? graphStateJson : {};
  const pendingInterrupts = interrupts.filter((interrupt) => interrupt.status === 'pending');

  return {
    ...current,
    interrupts,
    pendingInterruptCount: pendingInterrupts.length,
    activeInterruptId: pendingInterrupts[0]?.id ?? null,
    updatedAt: new Date().toISOString(),
  } as const;
}

async function getProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

async function listRunRecords(runType: GraphRunType, projectId: string, userId: string): Promise<GraphRunRecord[]> {
  if (runType === 'generation') {
    return prisma.generationRun.findMany({
      where: { projectId, userId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        graphStateJson: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  return prisma.agentRun.findMany({
    where: { projectId, userId },
    select: {
      id: true,
      projectId: true,
      userId: true,
      graphStateJson: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function getRunRecord(runType: GraphRunType, runId: string, userId: string): Promise<GraphRunRecord | null> {
  if (runType === 'generation') {
    return prisma.generationRun.findFirst({
      where: { id: runId, userId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        graphStateJson: true,
      },
    });
  }

  return prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: {
      id: true,
      projectId: true,
      userId: true,
      graphStateJson: true,
    },
  });
}

async function persistRunInterrupts(
  runType: GraphRunType,
  runId: string,
  nextGraphStateJson: unknown,
) {
  if (runType === 'generation') {
    await prisma.generationRun.update({
      where: { id: runId },
      data: { graphStateJson: nextGraphStateJson as any },
    });
    return;
  }

  await prisma.agentRun.update({
    where: { id: runId },
    data: { graphStateJson: nextGraphStateJson as any },
  });
}

async function listProjectInterruptsForType(
  runType: GraphRunType,
  projectId: string,
  userId: string,
) {
  const runs = await listRunRecords(runType, projectId, userId);
  return runs.flatMap((run) => readInterrupts(run.graphStateJson, runType, run.id));
}

export async function listProjectPendingInterrupts(
  projectId: string,
  userId: string,
): Promise<GraphInterrupt[] | null> {
  const project = await getProject(projectId, userId);
  if (!project) return null;

  const [generationInterrupts, agentInterrupts] = await Promise.all([
    listProjectInterruptsForType('generation', projectId, userId),
    listProjectInterruptsForType('agent', projectId, userId),
  ]);

  return [...generationInterrupts, ...agentInterrupts]
    .filter((interrupt) => interrupt.status === 'pending')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listGenerationRunInterrupts(runId: string, userId: string): Promise<GraphInterrupt[] | null> {
  const run = await getRunRecord('generation', runId, userId);
  if (!run) return null;
  return readInterrupts(run.graphStateJson, 'generation', run.id);
}

export async function listAgentRunInterrupts(runId: string, userId: string): Promise<GraphInterrupt[] | null> {
  const run = await getRunRecord('agent', runId, userId);
  if (!run) return null;
  return readInterrupts(run.graphStateJson, 'agent', run.id);
}

async function resolveRunInterrupt(
  runType: GraphRunType,
  runId: string,
  userId: string,
  interruptId: string,
  action: GraphInterruptResolutionAction,
  resolutionPayload: unknown,
): Promise<ResolveInterruptResult> {
  const run = await getRunRecord(runType, runId, userId);
  if (!run) return { status: 'run_not_found' };

  const currentInterrupts = readInterrupts(run.graphStateJson, runType, run.id);
  const interruptIndex = currentInterrupts.findIndex((interrupt) => interrupt.id === interruptId);
  if (interruptIndex === -1) {
    return { status: 'interrupt_not_found' };
  }

  const currentInterrupt = currentInterrupts[interruptIndex];
  if (currentInterrupt.status !== 'pending') {
    return { status: 'interrupt_not_pending', interrupt: currentInterrupt };
  }

  const nextStatus: GraphInterruptStatus =
    action === 'approve' ? 'approved'
      : action === 'edit' ? 'edited'
        : 'rejected';

  const nextInterrupt: GraphInterrupt = {
    ...currentInterrupt,
    status: nextStatus,
    resolutionPayload: resolutionPayload ?? null,
    resolvedByUserId: userId,
    resolvedAt: new Date().toISOString(),
  };
  const nextInterrupts = [...currentInterrupts];
  nextInterrupts[interruptIndex] = nextInterrupt;

  await persistRunInterrupts(runType, run.id, writeInterrupts(run.graphStateJson, nextInterrupts));

  return {
    status: 'resolved',
    interrupt: nextInterrupt,
  };
}

export async function resolveGenerationRunInterrupt(
  runId: string,
  userId: string,
  interruptId: string,
  action: GraphInterruptResolutionAction,
  resolutionPayload: unknown,
) {
  return resolveRunInterrupt('generation', runId, userId, interruptId, action, resolutionPayload);
}

export async function resolveAgentRunInterrupt(
  runId: string,
  userId: string,
  interruptId: string,
  action: GraphInterruptResolutionAction,
  resolutionPayload: unknown,
) {
  return resolveRunInterrupt('agent', runId, userId, interruptId, action, resolutionPayload);
}
