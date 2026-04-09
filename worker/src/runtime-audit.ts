import { type Job, type Queue } from 'bullmq';
import { prisma } from '../../server/src/config/database.js';

type RunType = 'generation' | 'agent';
type AuditedQueueName = 'generation' | 'agent' | 'export';

interface PendingInterruptSummary {
  runType: RunType;
  runId: string;
  projectId: string;
  interruptId: string;
  kind: string;
  title: string;
  createdAt: string;
  ageMinutes: number;
}

export interface RuntimeAuditSummary {
  generatedAt: string;
  queuedGenerationRuns: number;
  queuedAgentRuns: number;
  queuedExportJobs: number;
  stalePendingInterrupts: number;
  staleQueueBacklogs: number;
  violations: string[];
  pendingInterrupts: PendingInterruptSummary[];
  queueBacklogs: QueueBacklogSummary[];
}

interface RuntimeAuditThresholds {
  queuedGenerationMinutes: number;
  queuedAgentMinutes: number;
  queuedExportMinutes: number;
  pendingInterruptMinutes: number;
  queueGenerationMinutes: number;
  queueAgentMinutes: number;
  queueExportMinutes: number;
}

interface RuntimeAuditConfig extends RuntimeAuditThresholds {
  enabled: boolean;
  intervalMs: number;
  forceFail: boolean;
}

interface PendingInterruptRecord {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
}

export interface QueueBacklogSummary {
  queueName: AuditedQueueName;
  waitingCount: number;
  delayedCount: number;
  prioritizedCount: number;
  waitingChildrenCount: number;
  activeCount: number;
  totalQueuedCount: number;
  oldestQueuedAt: string | null;
  oldestQueuedAgeMinutes: number | null;
}

interface RuntimeAuditDependencies {
  prismaClient?: typeof prisma;
  inspectQueueBacklogs?: () => Promise<QueueBacklogSummary[]>;
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsePendingInterrupts(graphStateJson: unknown): PendingInterruptRecord[] {
  if (!isRecord(graphStateJson) || !Array.isArray(graphStateJson.interrupts)) {
    return [];
  }

  return graphStateJson.interrupts
    .map((interrupt) => {
      if (!isRecord(interrupt)) return null;
      if (interrupt.status !== 'pending') return null;
      if (typeof interrupt.id !== 'string' || typeof interrupt.createdAt !== 'string') return null;
      return {
        id: interrupt.id,
        kind: typeof interrupt.kind === 'string' ? interrupt.kind : 'manual_review',
        title: typeof interrupt.title === 'string' ? interrupt.title : 'manual review',
        createdAt: interrupt.createdAt,
      } satisfies PendingInterruptRecord;
    })
    .filter((interrupt): interrupt is PendingInterruptRecord => Boolean(interrupt));
}

function minutesSince(isoTimestamp: string, now = Date.now()) {
  return Math.floor((now - new Date(isoTimestamp).getTime()) / 60_000);
}

export function resolveRuntimeAuditConfig(env = process.env): RuntimeAuditConfig {
  const queuedGenerationMinutes = parsePositiveInt(env.OPS_AUDIT_STALE_GENERATION_MINUTES, 15);
  const queuedAgentMinutes = parsePositiveInt(env.OPS_AUDIT_STALE_AGENT_MINUTES, 15);
  const queuedExportMinutes = parsePositiveInt(env.OPS_AUDIT_STALE_EXPORT_MINUTES, 15);
  return {
    enabled: env.OPS_AUDIT_ENABLED !== 'false',
    intervalMs: parsePositiveInt(env.OPS_AUDIT_INTERVAL_MS, 5 * 60 * 1000),
    queuedGenerationMinutes,
    queuedAgentMinutes,
    queuedExportMinutes,
    pendingInterruptMinutes: parsePositiveInt(env.OPS_AUDIT_PENDING_INTERRUPT_MINUTES, 20),
    queueGenerationMinutes: parsePositiveInt(env.OPS_AUDIT_QUEUE_GENERATION_MINUTES, queuedGenerationMinutes),
    queueAgentMinutes: parsePositiveInt(env.OPS_AUDIT_QUEUE_AGENT_MINUTES, queuedAgentMinutes),
    queueExportMinutes: parsePositiveInt(env.OPS_AUDIT_QUEUE_EXPORT_MINUTES, queuedExportMinutes),
    forceFail: env.OPS_AUDIT_FORCE_FAIL === '1',
  };
}

function readQueueThresholdMinutes(queueName: AuditedQueueName, thresholds: RuntimeAuditThresholds) {
  switch (queueName) {
    case 'generation':
      return thresholds.queueGenerationMinutes;
    case 'agent':
      return thresholds.queueAgentMinutes;
    case 'export':
      return thresholds.queueExportMinutes;
  }
}

async function inspectQueueBacklogs(): Promise<QueueBacklogSummary[]> {
  return [];
}

function toQueuedJobTimestamp(job: Job | undefined) {
  return typeof job?.timestamp === 'number' && Number.isFinite(job.timestamp)
    ? job.timestamp
    : null;
}

async function loadQueueBacklog(queueName: AuditedQueueName, queue: Queue): Promise<QueueBacklogSummary> {
  const [counts, waitingJobs, delayedJobs, prioritizedJobs, waitingChildrenJobs] = await Promise.all([
    queue.getJobCounts('waiting', 'delayed', 'prioritized', 'waiting-children', 'active'),
    queue.getWaiting(0, 0),
    queue.getDelayed(0, 0),
    queue.getPrioritized(0, 0),
    queue.getWaitingChildren(0, 0),
  ]);

  const oldestTimestamp = [
    toQueuedJobTimestamp(waitingJobs[0]),
    toQueuedJobTimestamp(delayedJobs[0]),
    toQueuedJobTimestamp(prioritizedJobs[0]),
    toQueuedJobTimestamp(waitingChildrenJobs[0]),
  ]
    .filter((timestamp): timestamp is number => timestamp !== null)
    .sort((left, right) => left - right)[0] ?? null;

  const waitingCount = counts.waiting ?? 0;
  const delayedCount = counts.delayed ?? 0;
  const prioritizedCount = counts.prioritized ?? 0;
  const waitingChildrenCount = counts['waiting-children'] ?? 0;
  const activeCount = counts.active ?? 0;
  const totalQueuedCount = waitingCount + delayedCount + prioritizedCount + waitingChildrenCount;
  const oldestQueuedAt = oldestTimestamp === null ? null : new Date(oldestTimestamp).toISOString();

  return {
    queueName,
    waitingCount,
    delayedCount,
    prioritizedCount,
    waitingChildrenCount,
    activeCount,
    totalQueuedCount,
    oldestQueuedAt,
    oldestQueuedAgeMinutes: oldestQueuedAt === null ? null : minutesSince(oldestQueuedAt),
  };
}

export function createQueueBacklogInspector(queues: Record<AuditedQueueName, Queue>) {
  return async function inspectConfiguredQueueBacklogs(): Promise<QueueBacklogSummary[]> {
    return Promise.all([
      loadQueueBacklog('generation', queues.generation),
      loadQueueBacklog('agent', queues.agent),
      loadQueueBacklog('export', queues.export),
    ]);
  };
}

export async function runRuntimeAudit(
  thresholds: RuntimeAuditThresholds = resolveRuntimeAuditConfig(),
  dependencies: RuntimeAuditDependencies = {},
): Promise<RuntimeAuditSummary> {
  const prismaClient = dependencies.prismaClient ?? prisma;
  const inspectConfiguredQueueBacklogs = dependencies.inspectQueueBacklogs ?? inspectQueueBacklogs;
  const now = new Date();
  const generationCutoff = new Date(now.getTime() - thresholds.queuedGenerationMinutes * 60_000);
  const agentCutoff = new Date(now.getTime() - thresholds.queuedAgentMinutes * 60_000);
  const exportCutoff = new Date(now.getTime() - thresholds.queuedExportMinutes * 60_000);
  const interruptCutoff = new Date(now.getTime() - thresholds.pendingInterruptMinutes * 60_000);

  const [queuedGenerationRuns, queuedAgentRuns, queuedExportJobs, generationInterruptRuns, agentInterruptRuns, queueBacklogs] =
    await Promise.all([
      prismaClient.generationRun.count({
        where: {
          status: 'queued',
          createdAt: { lt: generationCutoff },
        },
      }),
      prismaClient.agentRun.count({
        where: {
          status: 'queued',
          createdAt: { lt: agentCutoff },
        },
      }),
      prismaClient.exportJob.count({
        where: {
          status: { in: ['queued', 'processing'] },
          createdAt: { lt: exportCutoff },
        },
      }),
      prismaClient.generationRun.findMany({
        where: {
          updatedAt: { lt: interruptCutoff },
        },
        select: {
          id: true,
          projectId: true,
          graphStateJson: true,
        },
      }),
      prismaClient.agentRun.findMany({
        where: {
          updatedAt: { lt: interruptCutoff },
        },
        select: {
          id: true,
          projectId: true,
          graphStateJson: true,
        },
      }),
      inspectConfiguredQueueBacklogs(),
    ]);

  const nowMs = now.getTime();
  const pendingInterrupts: PendingInterruptSummary[] = [
    ...generationInterruptRuns.flatMap((run) =>
      parsePendingInterrupts(run.graphStateJson).map((interrupt) => ({
        runType: 'generation' as const,
        runId: run.id,
        projectId: run.projectId,
        interruptId: interrupt.id,
        kind: interrupt.kind,
        title: interrupt.title,
        createdAt: interrupt.createdAt,
        ageMinutes: minutesSince(interrupt.createdAt, nowMs),
      })),
    ),
    ...agentInterruptRuns.flatMap((run) =>
      parsePendingInterrupts(run.graphStateJson).map((interrupt) => ({
        runType: 'agent' as const,
        runId: run.id,
        projectId: run.projectId,
        interruptId: interrupt.id,
        kind: interrupt.kind,
        title: interrupt.title,
        createdAt: interrupt.createdAt,
        ageMinutes: minutesSince(interrupt.createdAt, nowMs),
      })),
    ),
  ].sort((left, right) => right.ageMinutes - left.ageMinutes);

  const staleQueueBacklogs = queueBacklogs.filter((queueBacklog) =>
    queueBacklog.totalQueuedCount > 0
    && queueBacklog.oldestQueuedAgeMinutes !== null
    && queueBacklog.oldestQueuedAgeMinutes >= readQueueThresholdMinutes(queueBacklog.queueName, thresholds),
  );

  const violations: string[] = [];
  if (queuedGenerationRuns > 0) {
    violations.push(`stale queued generation runs: ${queuedGenerationRuns}`);
  }
  if (queuedAgentRuns > 0) {
    violations.push(`stale queued agent runs: ${queuedAgentRuns}`);
  }
  if (queuedExportJobs > 0) {
    violations.push(`stale queued export jobs: ${queuedExportJobs}`);
  }
  if (pendingInterrupts.length > 0) {
    violations.push(`stale pending interrupts: ${pendingInterrupts.length}`);
  }
  for (const queueBacklog of staleQueueBacklogs) {
    violations.push(
      `stale ${queueBacklog.queueName} queue backlog: ${queueBacklog.totalQueuedCount} queued, oldest ${queueBacklog.oldestQueuedAgeMinutes}m`,
    );
  }

  return {
    generatedAt: now.toISOString(),
    queuedGenerationRuns,
    queuedAgentRuns,
    queuedExportJobs,
    stalePendingInterrupts: pendingInterrupts.length,
    staleQueueBacklogs: staleQueueBacklogs.length,
    violations,
    pendingInterrupts,
    queueBacklogs,
  };
}

export function formatRuntimeAuditFingerprint(summary: RuntimeAuditSummary) {
  return JSON.stringify({
    queuedGenerationRuns: summary.queuedGenerationRuns,
    queuedAgentRuns: summary.queuedAgentRuns,
    queuedExportJobs: summary.queuedExportJobs,
    stalePendingInterrupts: summary.stalePendingInterrupts,
    staleQueueBacklogs: summary.staleQueueBacklogs,
    pendingInterruptIds: summary.pendingInterrupts.map((interrupt) => interrupt.interruptId),
    queueBacklogs: summary.queueBacklogs.map((queueBacklog) => ({
      queueName: queueBacklog.queueName,
      totalQueuedCount: queueBacklog.totalQueuedCount,
      oldestQueuedAgeMinutes: queueBacklog.oldestQueuedAgeMinutes,
    })),
  });
}

export function startRuntimeAuditLoop(
  config = resolveRuntimeAuditConfig(),
  dependencies: RuntimeAuditDependencies = {},
) {
  if (!config.enabled) {
    console.info('[ops.audit] disabled');
    return () => {};
  }

  let lastViolationFingerprint: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const runOnce = async () => {
    if (stopped) return;

    try {
      const summary = await runRuntimeAudit(config, dependencies);
      if (config.forceFail) {
        summary.violations.push('forced audit failure for validation');
      }

      const fingerprint = formatRuntimeAuditFingerprint(summary);
      if (summary.violations.length > 0 || config.forceFail) {
        if (fingerprint !== lastViolationFingerprint || config.forceFail) {
          console.error('[ops.audit] OPS_AUDIT_VIOLATION', JSON.stringify(summary));
        }
        lastViolationFingerprint = fingerprint;
      } else if (lastViolationFingerprint !== null) {
        console.info('[ops.audit] OPS_AUDIT_RECOVERED', JSON.stringify(summary));
        lastViolationFingerprint = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ops.audit] OPS_AUDIT_ERROR', message);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void runOnce();
        }, config.intervalMs);
        timer.unref();
      }
    }
  };

  void runOnce();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
